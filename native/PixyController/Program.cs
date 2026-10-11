using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;

namespace PixyController
{
    internal static class Program
    {
        private const string PixyVidPid = "VID_328F&PID_00C0";
        private const int ExitOk = 0;
        private const int ExitUsage = 1;
        private const int ExitNotFound = 2;
        private const int ExitNoCameraControl = 4;
        private const int ExitControlError = 5;
        private const int ExitSetFailed = 6;

        private static string PresetStorePath()
        {
            return Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "PixyController",
                "presets.json");
        }

        private static bool TryReadPresets(out string startName, out Dictionary<string, int[]> presets)
        {
            presets = new Dictionary<string, int[]>();
            startName = null;
            string path = PresetStorePath();
            if (!File.Exists(path))
                return true;

            try
            {
                object parsed = Json.Parse(File.ReadAllText(path));
                JsonObject root = parsed as JsonObject;
                if (root == null)
                    return false;

                startName = root.GetString("start");

                Dictionary<string, object> store;
                if (!root.TryGetObject("presets", out store))
                    return true;

                foreach (KeyValuePair<string, object> pair in store)
                {
                    Dictionary<string, object> position = pair.Value as Dictionary<string, object>;
                    if (position == null)
                        continue;

                    int pan;
                    int tilt;
                    int zoom;
                    if (TryGetPositionValue(position, "pan", out pan) &&
                        TryGetPositionValue(position, "tilt", out tilt) &&
                        TryGetPositionValue(position, "zoom", out zoom))
                        presets[pair.Key] = new[] { pan, tilt, zoom };
                }

                return true;
            }
            catch
            {
                return false;
            }
        }

        private static bool TryGetPositionValue(Dictionary<string, object> position, string key, out int value)
        {
            object raw;
            if (position.TryGetValue(key, out raw))
            {
                if (raw is long)
                {
                    value = (int)(long)raw;
                    return true;
                }

                if (raw is int)
                {
                    value = (int)raw;
                    return true;
                }

                if (raw is double)
                {
                    value = (int)(double)raw;
                    return true;
                }
            }

            value = 0;
            return false;
        }

        private static void WritePresets(string startName, Dictionary<string, int[]> presets)
        {
            string path = PresetStorePath();
            string directory = Path.GetDirectoryName(path);
            if (!Directory.Exists(directory))
                Directory.CreateDirectory(directory);

            Dictionary<string, object> store = new Dictionary<string, object>();
            foreach (KeyValuePair<string, int[]> pair in presets)
            {
                Dictionary<string, object> position = new Dictionary<string, object>();
                position["pan"] = pair.Value[0];
                position["tilt"] = pair.Value[1];
                position["zoom"] = pair.Value[2];
                store[pair.Key] = position;
            }

            Dictionary<string, object> root = new Dictionary<string, object>();
            if (startName != null)
                root["start"] = startName;
            root["presets"] = store;
            File.WriteAllText(path, Json.Serialize(root));
        }

        private static bool RequiresCamera(string command)
        {
            switch (command)
            {
                case "preset-list":
                case "preset-set-start":
                case "preset-delete":
                case "mode":
                    return false;
                default:
                    return true;
            }
        }

        private static int Main(string[] arguments)
        {
            if (arguments.Length == 0)
            {
                PrintUsage();
                return ExitUsage;
            }

            string command = arguments[0].ToLowerInvariant();
            if (command == "help" || command == "--help" || command == "-h")
            {
                PrintUsage();
                return ExitOk;
            }

            if (command == "serve")
                return Serve();

            IAMCameraControl cameraControl = RequiresCamera(command) ? FindPixyCameraControl() : null;
            if (RequiresCamera(command) && cameraControl == null)
                return ExitNotFound;

            try
            {
                List<string> lines = new List<string>();
                int exit = Dispatch(command, arguments, cameraControl, lines);
                foreach (string line in lines)
                    Console.WriteLine(line);
                return exit;
            }
            finally
            {
                if (cameraControl != null)
                    Marshal.ReleaseComObject(cameraControl);
            }
        }

        /// <summary>
        /// Persistent NDJSON bridge for the Ulanzi plugin:
        /// reads one JSON request per line from stdin, writes one JSON response
        /// per line to stdout. The camera is opened and released for each
        /// command so the handle is never held during idle time.
        /// </summary>
        private static int Serve()
        {
            ApplyStartPositionOnServe();

            string line;
            while ((line = Console.In.ReadLine()) != null)
            {
                if (string.IsNullOrWhiteSpace(line))
                    continue;

                object request;
                try
                {
                    request = Json.Parse(line);
                }
                catch
                {
                    Console.Out.WriteLine(Json.Serialize(MakeResponse(false, null, "invalid JSON")));
                    continue;
                }

                JsonObject req = request as JsonObject;
                if (req == null)
                {
                    Console.Out.WriteLine(Json.Serialize(MakeResponse(false, null, "expected a JSON object")));
                    continue;
                }

                string cmd = req.GetString("cmd");
                if (cmd == "quit")
                {
                    Console.Out.WriteLine(Json.Serialize(MakeResponse(true, cmd, null)));
                    break;
                }

                Dictionary<string, object> response = ExecuteBridgeCommand(req);
                Console.Out.WriteLine(Json.Serialize(response));
                Console.Out.Flush();
            }

            return ExitOk;
        }

        private static Dictionary<string, object> MakeResponse(bool ok, string request, string error)
        {
            Dictionary<string, object> response = new Dictionary<string, object>();
            response.Add("ok", ok);
            response.Add("request", request);
            if (error != null)
                response.Add("error", error);
            return response;
        }

        private static Dictionary<string, object> ExecuteBridgeCommand(JsonObject req)
        {
            string cmd = req.GetString("cmd");
            Dictionary<string, object> response = MakeResponse(false, cmd, null);

            IAMCameraControl cameraControl = null;
            if (RequiresCamera(cmd))
            {
                cameraControl = FindPixyCameraControl();
                if (cameraControl == null)
                {
                    response["error"] = "PIXY not found";
                    return response;
                }
            }

            try
            {
                string[] args = BuildArguments(req);
                List<string> lines = new List<string>();
                int exit = Dispatch(cmd, args, cameraControl, lines);
                response["ok"] = exit == ExitOk;
                if (exit != ExitOk)
                {
                    response["error"] = lines.Count > 0 ? lines[lines.Count - 1] : "command failed";
                    return response;
                }

                response["result"] = lines;
                return response;
            }
            catch (Exception ex)
            {
                response["ok"] = false;
                response["error"] = ex.Message;
                return response;
            }
            finally
            {
                if (cameraControl != null)
                    Marshal.ReleaseComObject(cameraControl);
            }
        }

        /// <summary>
        /// Runs one command against an already-bound camera. Writes diagnostic
        /// lines into <paramref name="lines"/> and returns an exit code.
        /// </summary>
        private static int Dispatch(string command, string[] arguments, IAMCameraControl cameraControl, List<string> lines)
        {
            int panDelta;
            int tiltDelta;
            int zoomDelta;
            int setValue;
            CameraControlProperty setProperty;
            switch (command)
            {
                case "info":
                    return Info(cameraControl, lines);
                case "get":
                    return GetCurrent(cameraControl, lines);
                case "center":
                    return Center(cameraControl, lines);
                case "pan":
                    if (arguments.Length == 2 && int.TryParse(arguments[1], out panDelta))
                        return MoveRelativeCore(cameraControl, CameraControlProperty.Pan, panDelta, lines);
                    PrintUsage();
                    return ExitUsage;
                case "tilt":
                    if (arguments.Length == 2 && int.TryParse(arguments[1], out tiltDelta))
                        return MoveRelativeCore(cameraControl, CameraControlProperty.Tilt, tiltDelta, lines);
                    PrintUsage();
                    return ExitUsage;
                case "zoom":
                    if (arguments.Length == 2 && int.TryParse(arguments[1], out zoomDelta))
                        return MoveRelativeCore(cameraControl, CameraControlProperty.Zoom, zoomDelta, lines);
                    PrintUsage();
                    return ExitUsage;
                case "move":
                    if (arguments.Length == 3 && TryParseControl(arguments[1], out setProperty) &&
                        int.TryParse(arguments[2], out setValue))
                        return MoveRelativeCore(cameraControl, setProperty, setValue, lines);
                    lines.Add("move: expected <pan|tilt|zoom> <signed-delta>");
                    return ExitUsage;
                case "set":
                    if (arguments.Length == 3 && TryParseControl(arguments[1], out setProperty) &&
                        int.TryParse(arguments[2], out setValue))
                        return SetAbsoluteCore(cameraControl, setProperty, setValue, lines);
                    PrintUsage();
                    return ExitUsage;
                case "preset-save":
                    if (arguments.Length == 2)
                        return PresetSave(cameraControl, arguments[1], lines);
                    PrintUsage();
                    return ExitUsage;
                case "preset-load":
                    if (arguments.Length == 2)
                        return PresetLoad(cameraControl, arguments[1], lines);
                    PrintUsage();
                    return ExitUsage;
                case "preset-list":
                    return PresetList(lines);
                case "preset-set-start":
                    if (arguments.Length == 2)
                        return PresetSetStart(arguments[1], lines);
                    PrintUsage();
                    return ExitUsage;
                case "preset-delete":
                    if (arguments.Length == 2)
                        return PresetDelete(arguments[1], lines);
                    PrintUsage();
                    return ExitUsage;
                case "start":
                    return RecallStart(cameraControl, lines);
                case "mode":
                    if (arguments.Length == 2)
                        return SetCameraMode(arguments[1], lines);
                    PrintUsage();
                    return ExitUsage;
                default:
                    PrintUsage();
                    return ExitUsage;
            }
        }

        /// <summary>
        /// Rebuilds CLI-style arguments for the named command from a bridge
        /// request so both entry points share the same dispatch logic.
        /// </summary>
        private static string[] BuildArguments(JsonObject req)
        {
            switch (req.GetString("cmd"))
            {
                case "move":
                    return new[] { "move", req.GetString("axis"), req.GetStringContent("delta") };
                case "set":
                    return new[] { "set", req.GetString("axis"), req.GetStringContent("value") };
                case "preset-save":
                    return new[] { "preset-save", req.GetString("name") };
                case "preset-load":
                    return new[] { "preset-load", req.GetString("name") };
                case "preset-set-start":
                    return new[] { "preset-set-start", req.GetString("name") };
                case "preset-delete":
                    return new[] { "preset-delete", req.GetString("name") };
                case "mode":
                    return new[] { "mode", req.GetString("value") };
                default:
                    return new string[0];
            }
        }

        private static int Info(IAMCameraControl cameraControl, List<string> lines)
        {
            int exit = ExitOk;
            AddRange(lines, cameraControl, CameraControlProperty.Pan, ref exit);
            AddRange(lines, cameraControl, CameraControlProperty.Tilt, ref exit);
            AddRange(lines, cameraControl, CameraControlProperty.Zoom, ref exit);
            return exit;
        }

        private static void AddRange(List<string> lines, IAMCameraControl cameraControl, CameraControlProperty property, ref int currentExit)
        {
            int minimum;
            int maximum;
            int step;
            int defaultValue;
            CameraControlFlags capabilities;
            int rangeHr = cameraControl.GetRange(property, out minimum, out maximum, out step, out defaultValue, out capabilities);
            if (rangeHr < 0)
            {
                lines.Add(property + ".GetRange: " + FormatHResult(rangeHr));
                if (currentExit == ExitOk)
                    currentExit = ExitControlError;
                return;
            }

            int currentValue;
            CameraControlFlags currentFlags;
            int getHr = cameraControl.Get(property, out currentValue, out currentFlags);
            lines.Add(property + ": min=" + minimum + "; max=" + maximum + "; step=" + step +
                      "; default=" + defaultValue + "; current=" + currentValue +
                      "; caps=" + FormatCapabilities(capabilities));
            if (getHr < 0)
            {
                lines.Add(property + ".Get: " + FormatHResult(getHr));
                if (currentExit == ExitOk)
                    currentExit = ExitControlError;
            }
        }

        private static int GetCurrent(IAMCameraControl cameraControl, List<string> lines)
        {
            foreach (CameraControlProperty property in new[] { CameraControlProperty.Pan, CameraControlProperty.Tilt, CameraControlProperty.Zoom })
            {
                int currentValue;
                CameraControlFlags currentFlags;
                int getHr = cameraControl.Get(property, out currentValue, out currentFlags);
                lines.Add(property + "=" + currentValue + " flags=" + FormatCapabilities(currentFlags));
                if (getHr < 0)
                {
                    lines.Add(property + ".Get: " + FormatHResult(getHr));
                    return ExitControlError;
                }
            }

            return ExitOk;
        }

        private static int Center(IAMCameraControl cameraControl, List<string> lines)
        {
            int exit = ExitOk;
            foreach (CameraControlProperty property in new[] { CameraControlProperty.Pan, CameraControlProperty.Tilt, CameraControlProperty.Zoom })
            {
                int minimum;
                int maximum;
                int step;
                int defaultValue;
                CameraControlFlags capabilities;
                int rangeHr = cameraControl.GetRange(property, out minimum, out maximum, out step, out defaultValue, out capabilities);
                if (rangeHr < 0)
                {
                    lines.Add(property + ".GetRange: " + FormatHResult(rangeHr));
                    return ExitControlError;
                }

                int setHr = cameraControl.Set(property, defaultValue, CameraControlFlags.Manual);
                if (setHr < 0)
                {
                    lines.Add("CENTER " + property + ".Set(default=" + defaultValue + "): " + FormatHResult(setHr));
                    return ExitSetFailed;
                }

                lines.Add("CENTER " + property + " -> default " + defaultValue + ": " + FormatHResult(setHr));
            }

            return exit;
        }

        private static int MoveRelativeCore(IAMCameraControl cameraControl, CameraControlProperty property, int delta, List<string> lines)
        {
            int minimum;
            int maximum;
            int step;
            int defaultValue;
            CameraControlFlags capabilities;
            int rangeHr = cameraControl.GetRange(property, out minimum, out maximum, out step, out defaultValue, out capabilities);
            if (rangeHr < 0 || (capabilities & CameraControlFlags.Manual) == 0)
            {
                lines.Add(property + ": cannot perform a safe manual write; GetRange=" + FormatHResult(rangeHr));
                return ExitControlError;
            }

            int currentValue;
            CameraControlFlags currentFlags;
            int initialGetHr = cameraControl.Get(property, out currentValue, out currentFlags);
            if (initialGetHr < 0)
            {
                lines.Add(property + ".Get: " + FormatHResult(initialGetHr));
                return ExitControlError;
            }

            long targetLong = (long)currentValue + delta;
            targetLong = Math.Max(minimum, Math.Min(maximum, targetLong));
            int targetValue = (int)targetLong;

            int setHr = cameraControl.Set(property, targetValue, CameraControlFlags.Manual);
            if (setHr < 0)
            {
                lines.Add(property + ".Set(" + targetValue + "): " + FormatHResult(setHr));
                return ExitSetFailed;
            }

            int observedValue;
            CameraControlFlags observedFlags;
            int verifyGetHr = cameraControl.Get(property, out observedValue, out observedFlags);
            lines.Add(property + ": " + currentValue + " -> " + targetValue + " (clamped [" + minimum + "," + maximum + "]); verify=" +
                      (verifyGetHr >= 0 ? observedValue.ToString() : "FAILED " + FormatHResult(verifyGetHr)) + "; set=" + FormatHResult(setHr));
            return ExitOk;
        }

        private static int SetAbsoluteCore(IAMCameraControl cameraControl, CameraControlProperty property, int requested, List<string> lines)
        {
            int minimum;
            int maximum;
            int step;
            int defaultValue;
            CameraControlFlags capabilities;
            int rangeHr = cameraControl.GetRange(property, out minimum, out maximum, out step, out defaultValue, out capabilities);
            if (rangeHr < 0 || (capabilities & CameraControlFlags.Manual) == 0)
            {
                lines.Add(property + ": cannot perform a safe manual write; GetRange=" + FormatHResult(rangeHr));
                return ExitControlError;
            }

            long clampedLong = Math.Max(minimum, Math.Min(maximum, (long)requested));
            int clamped = (int)clampedLong;
            int setHr = cameraControl.Set(property, clamped, CameraControlFlags.Manual);
            if (setHr < 0)
            {
                lines.Add(property + ".Set(" + clamped + "): " + FormatHResult(setHr));
                return ExitSetFailed;
            }

            lines.Add(property + ": set " + clamped + " (requested " + requested + ", range [" + minimum + "," + maximum + "]): " + FormatHResult(setHr));

            int observedValue;
            CameraControlFlags observedFlags;
            int verifyGetHr = cameraControl.Get(property, out observedValue, out observedFlags);
            if (verifyGetHr >= 0)
                lines.Add(property + ": verify=" + observedValue);
            else
                lines.Add(property + ".Get: " + FormatHResult(verifyGetHr));

            return ExitOk;
        }

        private static int ApplyPresetValues(IAMCameraControl cameraControl, int pan, int tilt, int zoom, List<string> lines)
        {
            int exit = ExitOk;
            int result = SetAbsoluteCore(cameraControl, CameraControlProperty.Pan, pan, lines);
            if (result != ExitOk)
                exit = result;
            result = SetAbsoluteCore(cameraControl, CameraControlProperty.Tilt, tilt, lines);
            if (result != ExitOk)
                exit = result;
            result = SetAbsoluteCore(cameraControl, CameraControlProperty.Zoom, zoom, lines);
            if (result != ExitOk)
                exit = result;
            return exit;
        }

        private static void ApplyStartPositionOnServe()
        {
            string startName;
            Dictionary<string, int[]> presets;
            if (!TryReadPresets(out startName, out presets))
            {
                Console.Error.WriteLine("presets: cannot read presets file; start position skipped");
                return;
            }

            if (startName == null || !presets.ContainsKey(startName))
            {
                Console.Error.WriteLine("presets: no start position defined; skipped");
                return;
            }

            IAMCameraControl cameraControl = FindPixyCameraControl();
            if (cameraControl == null)
            {
                Console.Error.WriteLine("presets: PIXY not found; start position skipped");
                return;
            }

            try
            {
                int[] position = presets[startName];
                List<string> lines = new List<string>();
                int exit = ApplyPresetValues(cameraControl, position[0], position[1], position[2], lines);
                foreach (string perspective in lines)
                    Console.Error.WriteLine("presets: " + perspective);
                Console.Error.WriteLine("presets: start position '" + startName + "' applied, exit=" + exit);
            }
            finally
            {
                Marshal.ReleaseComObject(cameraControl);
            }
        }

        private static int PresetSave(IAMCameraControl cameraControl, string name, List<string> lines)
        {
            if (string.IsNullOrWhiteSpace(name))
            {
                lines.Add("preset-save: expected a preset name");
                return ExitUsage;
            }

            int pan;
            int tilt;
            int zoom;
            CameraControlFlags flags;
            int panHr = cameraControl.Get(CameraControlProperty.Pan, out pan, out flags);
            int tiltHr = cameraControl.Get(CameraControlProperty.Tilt, out tilt, out flags);
            int zoomHr = cameraControl.Get(CameraControlProperty.Zoom, out zoom, out flags);
            if (panHr < 0 || tiltHr < 0 || zoomHr < 0)
            {
                lines.Add("preset-save: cannot read current position (pan=" + FormatHResult(panHr) +
                          ", tilt=" + FormatHResult(tiltHr) + ", zoom=" + FormatHResult(zoomHr) + ")");
                return ExitControlError;
            }

            string startName;
            Dictionary<string, int[]> presets;
            if (!TryReadPresets(out startName, out presets))
            {
                lines.Add("preset-save: cannot read presets file");
                return ExitControlError;
            }

            presets[name] = new[] { pan, tilt, zoom };
            WritePresets(startName, presets);
            lines.Add("preset-save '" + name + "': pan=" + pan + "; tilt=" + tilt + "; zoom=" + zoom);
            return ExitOk;
        }

        private static int PresetLoad(IAMCameraControl cameraControl, string name, List<string> lines)
        {
            string startName;
            Dictionary<string, int[]> presets;
            if (!TryReadPresets(out startName, out presets))
            {
                lines.Add("preset-load: cannot read presets file");
                return ExitControlError;
            }

            int[] position;
            if (!presets.TryGetValue(name, out position))
            {
                lines.Add("preset-load: unknown preset '" + name + "'");
                return ExitUsage;
            }

            int exit = ApplyPresetValues(cameraControl, position[0], position[1], position[2], lines);
            lines.Add("preset-load '" + name + "': pan=" + position[0] + "; tilt=" + position[1] + "; zoom=" + position[2] + "; exit=" + exit);
            return exit;
        }

        private static int PresetList(List<string> lines)
        {
            string startName;
            Dictionary<string, int[]> presets;
            if (!TryReadPresets(out startName, out presets))
            {
                lines.Add("preset-list: cannot read presets file");
                return ExitControlError;
            }

            if (presets.Count == 0)
            {
                lines.Add("preset-list: no presets defined");
                return ExitOk;
            }

            foreach (KeyValuePair<string, int[]> pair in presets)
            {
                string marker = pair.Key == startName ? " (start)" : string.Empty;
                lines.Add("preset-list: '" + pair.Key + "' pan=" + pair.Value[0] + "; tilt=" + pair.Value[1] +
                          "; zoom=" + pair.Value[2] + marker);
            }

            return ExitOk;
        }

        private static int PresetSetStart(string name, List<string> lines)
        {
            if (string.IsNullOrWhiteSpace(name))
            {
                lines.Add("preset-set-start: expected a preset name");
                return ExitUsage;
            }

            string startName;
            Dictionary<string, int[]> presets;
            if (!TryReadPresets(out startName, out presets))
            {
                lines.Add("preset-set-start: cannot read presets file");
                return ExitControlError;
            }

            if (!presets.ContainsKey(name))
            {
                lines.Add("preset-set-start: unknown preset '" + name + "'");
                return ExitUsage;
            }

            WritePresets(name, presets);
            lines.Add("preset-set-start '" + name + "': start position set");
            return ExitOk;
        }

        private static int RecallStart(IAMCameraControl cameraControl, List<string> lines)
        {
            string startName;
            Dictionary<string, int[]> presets;
            if (!TryReadPresets(out startName, out presets))
            {
                lines.Add("start: cannot read presets file");
                return ExitControlError;
            }

            if (startName == null || !presets.ContainsKey(startName))
            {
                lines.Add("start: no start position defined; use preset-set-start <name>");
                return ExitUsage;
            }

            int[] position = presets[startName];
            int exit = ApplyPresetValues(cameraControl, position[0], position[1], position[2], lines);
            lines.Add("start: recall '" + startName + "' pan=" + position[0] + "; tilt=" + position[1] + "; zoom=" + position[2] + "; exit=" + exit);
            return exit;
        }

        private static int PresetDelete(string name, List<string> lines)
        {
            string startName;
            Dictionary<string, int[]> presets;
            if (!TryReadPresets(out startName, out presets))
            {
                lines.Add("preset-delete: cannot read presets file");
                return ExitControlError;
            }

            if (!presets.ContainsKey(name))
            {
                lines.Add("preset-delete: unknown preset '" + name + "'");
                return ExitUsage;
            }

            presets.Remove(name);
            if (startName == name)
                startName = null;
            WritePresets(startName, presets);
            lines.Add("preset-delete '" + name + "': removed");
            return ExitOk;
        }

        /// <summary>
        /// Sets the PIXY camera mode through the proprietary HID channel
        /// (validated in section 33). Delegates to the companion
        /// PixyHidProbe.exe (located next to this executable), sends the
        /// mode write report, then re-reads group 01 for information.
        ///
        /// Important: the group 01 readback is NOT a direct echo of the
        /// written value (PixyPilot reference: readback `03` = "non privacy,
        /// Standard vs Tracking unknown"). Success is therefore based on the
        /// write report being accepted (exit code 0); the readback is logged
        /// for information only.
        /// </summary>
        private static int SetCameraMode(string modeName, List<string> lines)
        {
            string hexValue;
            switch (modeName.ToLowerInvariant())
            {
                case "standard": hexValue = "00"; break;
                case "tracking": hexValue = "01"; break;
                case "privacy": hexValue = "02"; break;
                default:
                    lines.Add("mode: unknown mode '" + modeName + "' (expected standard|tracking|privacy)");
                    return ExitUsage;
            }

            string exeDirectory = Path.GetDirectoryName(System.Reflection.Assembly.GetExecutingAssembly().Location);
            string hidProbePath = Path.Combine(exeDirectory, "PixyHidProbe.exe");
            if (!File.Exists(hidProbePath))
            {
                lines.Add("mode: PixyHidProbe.exe not found next to PixyController.exe");
                lines.Add("mode: expected HID companion at " + hidProbePath);
                return ExitNotFound;
            }

            string writeReport = "09 01 01 00 00 01 00 01 " + hexValue;
            string readReport = "09 01 01 01";
            string writeResponse = RunHidQuery(hidProbePath, writeReport);
            if (writeResponse == null)
            {
                lines.Add("mode " + modeName + ": HID write report rejected / no response (exit != 0)");
                return ExitControlError;
            }

            string readResponse = RunHidQuery(hidProbePath, readReport);
            string observedValue = readResponse != null ? ExtractGroup01Value(readResponse) : null;
            lines.Add("mode " + modeName + ": write report accepted; readback group01=" +
                (observedValue ?? "?") + " (readback is informational; 03 = non-privacy per reference)");
            return ExitOk;
        }

        private static string RunHidQuery(string hidProbePath, string reportHex)
        {
            try
            {
                ProcessStartInfo startInfo = new ProcessStartInfo
                {
                    FileName = hidProbePath,
                    Arguments = "query \"" + reportHex + "\"",
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true
                };

                string stdout;
                using (Process process = Process.Start(startInfo))
                {
                    if (process == null)
                        return null;
                    stdout = process.StandardOutput.ReadToEnd();
                    process.WaitForExit();
                    if (process.ExitCode != 0)
                        return null;
                }

                string response = null;
                foreach (string line in stdout.Split('\n'))
                {
                    string trimmed = line.Trim();
                    if (trimmed.StartsWith("RESP:"))
                    {
                        response = trimmed.Substring(5).Trim();
                        break;
                    }
                }
                return response;
            }
            catch
            {
                return null;
            }
        }

        private static string ExtractGroup01Value(string responseHex)
        {
            if (responseHex == null)
                return null;
            string[] tokens = responseHex.Split((char[])null, StringSplitOptions.RemoveEmptyEntries);
            // Group 01 read response: 09 01 01 01 00 01 00 01 <value>
            return tokens.Length >= 9 ? tokens[8] : null;
        }

        private static IAMCameraControl FindPixyCameraControl()
        {
            ICreateDevEnum systemDeviceEnumerator = (ICreateDevEnum)Activator.CreateInstance(
                Type.GetTypeFromCLSID(DirectShowIds.CLSID_SystemDeviceEnum));

            Guid category = DirectShowIds.CLSID_VideoInputDeviceCategory;
            IEnumMoniker monikerEnumerator;
            int enumerateHr = systemDeviceEnumerator.CreateClassEnumerator(ref category, out monikerEnumerator, 0);
            if (enumerateHr != 0 || monikerEnumerator == null)
            {
                Marshal.ReleaseComObject(systemDeviceEnumerator);
                return null;
            }

            try
            {
                IMoniker selectedMoniker = FindPixyMoniker(monikerEnumerator);
                if (selectedMoniker == null)
                    return null;

                try
                {
                    return BindCameraControl(selectedMoniker);
                }
                finally
                {
                    Marshal.ReleaseComObject(selectedMoniker);
                }
            }
            finally
            {
                Marshal.ReleaseComObject(monikerEnumerator);
                Marshal.ReleaseComObject(systemDeviceEnumerator);
            }
        }

        private static IMoniker FindPixyMoniker(IEnumMoniker monikerEnumerator)
        {
            IMoniker[] monikers = new IMoniker[1];
            while (monikerEnumerator.Next(1, monikers, IntPtr.Zero) == 0)
            {
                IMoniker moniker = monikers[0];
                string friendlyName = ReadMonikerProperty(moniker, "FriendlyName");
                string devicePath = ReadMonikerProperty(moniker, "DevicePath");

                if ((devicePath != null && devicePath.IndexOf(PixyVidPid, StringComparison.OrdinalIgnoreCase) >= 0) ||
                    string.Equals(friendlyName, "EMEET PIXY", StringComparison.OrdinalIgnoreCase))
                    return moniker;

                Marshal.ReleaseComObject(moniker);
            }

            return null;
        }

        private static IAMCameraControl BindCameraControl(IMoniker moniker)
        {
            Guid iidUnknown = DirectShowIds.IID_IUnknown;
            object filterObject;
            moniker.BindToObject(null, null, ref iidUnknown, out filterObject);
            if (filterObject == null)
            {
                Console.Error.WriteLine("ERROR: the PIXY capture filter could not be bound.");
                return null;
            }

            try
            {
                IntPtr unknown = Marshal.GetIUnknownForObject(filterObject);
                try
                {
                    Guid cameraControlIid = DirectShowIds.IID_IAMCameraControl;
                    IntPtr cameraControlPointer;
                    int queryHr = Marshal.QueryInterface(unknown, ref cameraControlIid, out cameraControlPointer);
                    if (queryHr < 0 || cameraControlPointer == IntPtr.Zero)
                    {
                        Console.Error.WriteLine("ERROR: QueryInterface(IAMCameraControl) failed: " + FormatHResult(queryHr));
                        return null;
                    }

                    return (IAMCameraControl)Marshal.GetTypedObjectForIUnknown(
                        cameraControlPointer, typeof(IAMCameraControl));
                }
                finally
                {
                    Marshal.Release(unknown);
                }
            }
            finally
            {
                Marshal.ReleaseComObject(filterObject);
            }
        }

        private static bool TryParseControl(string text, out CameraControlProperty property)
        {
            if (string.Equals(text, "pan", StringComparison.OrdinalIgnoreCase))
            {
                property = CameraControlProperty.Pan;
                return true;
            }

            if (string.Equals(text, "tilt", StringComparison.OrdinalIgnoreCase))
            {
                property = CameraControlProperty.Tilt;
                return true;
            }

            if (string.Equals(text, "zoom", StringComparison.OrdinalIgnoreCase))
            {
                property = CameraControlProperty.Zoom;
                return true;
            }

            property = default(CameraControlProperty);
            return false;
        }

        private static void PrintUsage()
        {
            Console.Error.WriteLine("USAGE: pixy-controller <command> [arguments]");
            Console.Error.WriteLine("  info");
            Console.Error.WriteLine("  get");
            Console.Error.WriteLine("  center");
            Console.Error.WriteLine("  pan <signed-delta>");
            Console.Error.WriteLine("  tilt <signed-delta>");
            Console.Error.WriteLine("  zoom <signed-delta>");
            Console.Error.WriteLine("  set <pan|tilt|zoom> <absolute-value>");
            Console.Error.WriteLine("  preset-save <name>");
            Console.Error.WriteLine("  preset-load <name>");
            Console.Error.WriteLine("  preset-list");
            Console.Error.WriteLine("  preset-set-start <name>");
            Console.Error.WriteLine("  preset-delete <name>");
            Console.Error.WriteLine("  start");
            Console.Error.WriteLine("  mode <standard|tracking|privacy>");
            Console.Error.WriteLine("  serve");
            Console.Error.WriteLine("Moves are relative to the current position and clamped to [min,max].");
            Console.Error.WriteLine("mode: camera mode via the proprietary HID channel (PixyHidProbe.exe must sit next to this tool).");
            Console.Error.WriteLine("serve: persistent NDJSON bridge over stdin/stdout for the Ulanzi plugin.");
        }

        private static string ReadMonikerProperty(IMoniker moniker, string propertyName)
        {
            Guid propertyBagIid = DirectShowIds.IID_IPropertyBag;
            try
            {
                object propertyBagObject;
                moniker.BindToStorage(null, null, ref propertyBagIid, out propertyBagObject);
                IPropertyBag propertyBag = propertyBagObject as IPropertyBag;
                if (propertyBag == null)
                    return null;

                try
                {
                    object value = string.Empty;
                    return propertyBag.Read(propertyName, ref value, IntPtr.Zero) >= 0 ? value.ToString() : null;
                }
                finally
                {
                    Marshal.ReleaseComObject(propertyBag);
                }
            }
            catch (COMException)
            {
                return null;
            }
        }

        private static string FormatHResult(int hresult)
        {
            return hresult >= 0 ? "S_OK" : "0x" + unchecked((uint)hresult).ToString("X8");
        }

        private static string FormatCapabilities(CameraControlFlags flags)
        {
            return flags == 0 ? "0" : flags.ToString();
        }
    }

    /// <summary>
    /// Minimal JSON reader/writer to avoid any external dependency beyond the
    /// runtime that ships with Windows.
    /// </summary>
    internal sealed class JsonObject
    {
        private readonly Dictionary<string, object> _values;

        public JsonObject(Dictionary<string, object> values)
        {
            _values = values;
        }

        public string GetString(string key)
        {
            object value;
            return _values.TryGetValue(key, out value) && value is string ? (string)value : null;
        }

        private static string NumberToString(object value)
        {
            if (value is string)
                return (string)value;
            if (value is long)
                return ((long)value).ToString(System.Globalization.CultureInfo.InvariantCulture);
            if (value is int)
                return ((int)value).ToString(System.Globalization.CultureInfo.InvariantCulture);
            if (value is double)
                return ((double)value).ToString(System.Globalization.CultureInfo.InvariantCulture);
            return null;
        }

        public string GetStringContent(string key)
        {
            object value;
            return _values.TryGetValue(key, out value) ? NumberToString(value) : null;
        }

        public bool HasString(string key)
        {
            return GetString(key) != null;
        }

        public bool TryGetObject(string key, out Dictionary<string, object> value)
        {
            object raw;
            if (_values.TryGetValue(key, out raw) && raw is Dictionary<string, object>)
            {
                value = (Dictionary<string, object>)raw;
                return true;
            }

            value = null;
            return false;
        }
    }

    internal static class Json
    {
        private static int _index;
        private static string _text;

        public static object Parse(string text)
        {
            _text = text;
            _index = 0;
            object parsed = ParseValue();
            if (parsed is Dictionary<string, object>)
                return new JsonObject((Dictionary<string, object>)parsed);
            return parsed;
        }

        private static object ParseValue()
        {
            SkipWhitespace();
            char c = Peek();
            if (c == '{')
                return ParseObject();
            if (c == '[')
                return ParseArray();
            if (c == '"')
                return ParseString();
            if (c == 't')
            {
                Expect("true");
                return true;
            }
            if (c == 'f')
            {
                Expect("false");
                return false;
            }
            if (c == 'n')
            {
                Expect("null");
                return null;
            }
            return ParseNumber();
        }

        private static Dictionary<string, object> ParseObject()
        {
            Consume('{');
            Dictionary<string, object> result = new Dictionary<string, object>();
            SkipWhitespace();
            if (Peek() == '}')
            {
                _index++;
                return result;
            }

            while (true)
            {
                SkipWhitespace();
                string key = ParseString();
                SkipWhitespace();
                Consume(':');
                object value = ParseValue();
                result[key] = value;
                SkipWhitespace();
                char c = Peek();
                if (c == '}')
                {
                    _index++;
                    return result;
                }

                Consume(',');
            }
        }

        private static List<object> ParseArray()
        {
            Consume('[');
            List<object> result = new List<object>();
            SkipWhitespace();
            if (Peek() == ']')
            {
                _index++;
                return result;
            }

            while (true)
            {
                result.Add(ParseValue());
                SkipWhitespace();
                char c = Peek();
                if (c == ']')
                {
                    _index++;
                    return result;
                }

                Consume(',');
            }
        }

        private static string ParseString()
        {
            Consume('"');
            StringBuilder sb = new StringBuilder();
            while (_index < _text.Length)
            {
                char c = _text[_index++];
                if (c == '"')
                    return sb.ToString();
                if (c == '\\')
                {
                    char n = _text[_index++];
                    switch (n)
                    {
                        case 'n': sb.Append('\n'); break;
                        case 'r': sb.Append('\r'); break;
                        case 't': sb.Append('\t'); break;
                        case 'b': sb.Append('\b'); break;
                        case 'f': sb.Append('\f'); break;
                        case '\\': sb.Append('\\'); break;
                        case '/': sb.Append('/'); break;
                        case '"': sb.Append('"'); break;
                        case 'u':
                            sb.Append((char)Convert.ToInt32(_text.Substring(_index, 4), 16));
                            _index += 4;
                            break;
                        default: sb.Append(n); break;
                    }
                }
                else
                {
                    sb.Append(c);
                }
            }

            throw new FormatException("unterminated string");
        }

        private static object ParseNumber()
        {
            int start = _index;
            while (_index < _text.Length && ("-0123456789.eE+".IndexOf(_text[_index]) >= 0))
                _index++;
            string token = _text.Substring(start, _index - start);
            long asLong;
            if (long.TryParse(token, System.Globalization.NumberStyles.Integer, System.Globalization.CultureInfo.InvariantCulture, out asLong))
                return asLong;
            double asDouble;
            if (double.TryParse(token, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out asDouble))
                return asDouble;
            throw new FormatException("invalid number: " + token);
        }

        private static void Expect(string literal)
        {
            if (_index + literal.Length > _text.Length ||
                string.CompareOrdinal(_text, _index, literal, 0, literal.Length) != 0)
                throw new FormatException("expected " + literal);
            _index += literal.Length;
        }

        private static char Peek()
        {
            if (_index >= _text.Length)
                throw new FormatException("unexpected end");
            return _text[_index];
        }

        private static void Consume(char c)
        {
            if (Peek() != c)
                throw new FormatException("expected '" + c + "'");
            _index++;
        }

        private static void SkipWhitespace()
        {
            while (_index < _text.Length && char.IsWhiteSpace(_text[_index]))
                _index++;
        }

        public static string Serialize(object value)
        {
            return SerializeValue(value);
        }

        private static string SerializeValue(object value)
        {
            if (value == null)
                return "null";
            if (value is string)
                return SerializeString((string)value);
            if (value is bool)
                return (bool)value ? "true" : "false";
            if (value is IDictionary<string, object>)
            {
                StringBuilder sb = new StringBuilder("{");
                bool first = true;
                foreach (KeyValuePair<string, object> pair in (IDictionary<string, object>)value)
                {
                    if (!first)
                        sb.Append(",");
                    first = false;
                    sb.Append(SerializeString(pair.Key)).Append(":").Append(SerializeValue(pair.Value));
                }
                return sb.Append("}").ToString();
            }
            if (value is System.Collections.IEnumerable && !(value is string))
            {
                StringBuilder sb = new StringBuilder("[");
                bool first = true;
                foreach (object item in (System.Collections.IEnumerable)value)
                {
                    if (!first)
                        sb.Append(",");
                    first = false;
                    sb.Append(SerializeValue(item));
                }
                return sb.Append("]").ToString();
            }
            if (value is double || value is float)
                return ((double)value).ToString(System.Globalization.CultureInfo.InvariantCulture);
            if (value is long)
                return ((long)value).ToString(System.Globalization.CultureInfo.InvariantCulture);
            if (value is int || value is short || value is byte)
                return ((int)value).ToString(System.Globalization.CultureInfo.InvariantCulture);
            return value.ToString();
        }

        private static string SerializeString(string value)
        {
            StringBuilder sb = new StringBuilder("\"");
            foreach (char c in value)
            {
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    case '\b': sb.Append("\\b"); break;
                    case '\f': sb.Append("\\f"); break;
                    default:
                        if (c < 0x20)
                            sb.Append("\\u").Append(((int)c).ToString("X4"));
                        else
                            sb.Append(c);
                        break;
                }
            }

            return sb.Append("\"").ToString();
        }
    }

    internal static class DirectShowIds
    {
        internal static readonly Guid CLSID_SystemDeviceEnum = new Guid("62BE5D10-60EB-11D0-BD3B-00A0C911CE86");
        internal static readonly Guid CLSID_VideoInputDeviceCategory = new Guid("860BB310-5D01-11D0-BD3B-00A0C911CE86");
        internal static readonly Guid IID_IUnknown = new Guid("00000000-0000-0000-C000-000000000046");
        internal static readonly Guid IID_IAMCameraControl = new Guid("C6E13370-30AC-11D0-A18C-00A0C9118956");
        internal static readonly Guid IID_IPropertyBag = new Guid("55272A00-42CB-11CE-8135-00AA004BB851");
    }

    [ComImport, Guid("29840822-5B84-11D0-BD3B-00A0C911CE86"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface ICreateDevEnum
    {
        [PreserveSig]
        int CreateClassEnumerator(ref Guid category, [MarshalAs(UnmanagedType.Interface)] out IEnumMoniker enumerator, int flags);
    }

    [ComImport, Guid("55272A00-42CB-11CE-8135-00AA004BB851"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IPropertyBag
    {
        [PreserveSig]
        int Read([MarshalAs(UnmanagedType.LPWStr)] string propertyName, [In, Out, MarshalAs(UnmanagedType.Struct)] ref object value, IntPtr errorLog);
    }

    [ComImport, Guid("C6E13370-30AC-11D0-A18C-00A0C9118956"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IAMCameraControl
    {
        [PreserveSig]
        int GetRange(CameraControlProperty property, out int minimum, out int maximum, out int steppingDelta, out int defaultValue, out CameraControlFlags capabilities);

        [PreserveSig]
        int Set(CameraControlProperty property, int value, CameraControlFlags flags);

        [PreserveSig]
        int Get(CameraControlProperty property, out int value, out CameraControlFlags flags);
    }

    internal enum CameraControlProperty
    {
        Pan = 0,
        Tilt = 1,
        Zoom = 3,
    }

    [Flags]
    internal enum CameraControlFlags
    {
        Auto = 0x0001,
        Manual = 0x0002,
    }
}