using System;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Threading;

namespace PixyCameraControlDiagnostic
{
    // Read-only diagnostic: this source deliberately never calls IAMCameraControl.Set.
    internal static class Program
    {
        private const string PixyVidPid = "VID_328F&PID_00C0";

        private static int Main(string[] arguments)
        {
            ICreateDevEnum systemDeviceEnumerator = (ICreateDevEnum)Activator.CreateInstance(
                Type.GetTypeFromCLSID(DirectShowIds.CLSID_SystemDeviceEnum));

            Guid category = DirectShowIds.CLSID_VideoInputDeviceCategory;
            IEnumMoniker monikerEnumerator;
            int enumerateHr = systemDeviceEnumerator.CreateClassEnumerator(ref category, out monikerEnumerator, 0);
            if (enumerateHr != 0 || monikerEnumerator == null)
            {
                Console.Error.WriteLine("ERROR: video capture enumeration failed: " + FormatHResult(enumerateHr));
                return 1;
            }

            try
            {
                IMoniker selectedMoniker = null;
                string selectedName = null;
                string selectedPath = null;
                IMoniker[] monikers = new IMoniker[1];

                while (monikerEnumerator.Next(1, monikers, IntPtr.Zero) == 0)
                {
                    IMoniker moniker = monikers[0];
                    string friendlyName = ReadMonikerProperty(moniker, "FriendlyName");
                    string devicePath = ReadMonikerProperty(moniker, "DevicePath");
                    Console.WriteLine("DISCOVERED: name=" + (friendlyName ?? "<unavailable>") + "; path=" + (devicePath ?? "<unavailable>"));

                    if ((devicePath != null && devicePath.IndexOf(PixyVidPid, StringComparison.OrdinalIgnoreCase) >= 0) ||
                        string.Equals(friendlyName, "EMEET PIXY", StringComparison.OrdinalIgnoreCase))
                    {
                        selectedMoniker = moniker;
                        selectedName = friendlyName;
                        selectedPath = devicePath;
                        break;
                    }

                    Marshal.ReleaseComObject(moniker);
                }

                if (selectedMoniker == null)
                {
                    Console.Error.WriteLine("ERROR: EMEET PIXY was not found in the DirectShow video-capture category.");
                    return 2;
                }

                try
                {
                    Console.WriteLine("TARGET: name=" + (selectedName ?? "<unavailable>") + "; path=" + (selectedPath ?? "<unavailable>"));
                    Guid iidUnknown = DirectShowIds.IID_IUnknown;
                    object filterObject;
                    selectedMoniker.BindToObject(null, null, ref iidUnknown, out filterObject);
                    if (filterObject == null)
                    {
                        Console.Error.WriteLine("ERROR: the PIXY capture filter could not be bound.");
                        return 3;
                    }

                    try
                    {
                        IntPtr unknown = Marshal.GetIUnknownForObject(filterObject);
                        try
                        {
                            Guid cameraControlIid = DirectShowIds.IID_IAMCameraControl;
                            IntPtr cameraControlPointer;
                            int queryHr = Marshal.QueryInterface(unknown, ref cameraControlIid, out cameraControlPointer);
                            Console.WriteLine("IAMCameraControl.QueryInterface: " + FormatHResult(queryHr));
                            if (queryHr < 0 || cameraControlPointer == IntPtr.Zero)
                                return 4;

                            try
                            {
                                IAMCameraControl cameraControl = (IAMCameraControl)Marshal.GetTypedObjectForIUnknown(
                                    cameraControlPointer, typeof(IAMCameraControl));
                                Probe(cameraControl, CameraControlProperty.Pan);
                                Probe(cameraControl, CameraControlProperty.Tilt);
                                Probe(cameraControl, CameraControlProperty.Zoom);

                                if (arguments.Length == 0)
                                    return 0;

                                CameraControlProperty property;
                                if (arguments.Length == 2 && arguments[0] == "--verify-set" && TryParseProperty(arguments[1], out property))
                                    return VerifySetAndRestore(cameraControl, property) ? 0 : 6;

                                int delta;
                                if (arguments.Length == 3 && arguments[0] == "--move-test" && TryParseProperty(arguments[1], out property) &&
                                    int.TryParse(arguments[2], out delta) && delta != 0)
                                    return MoveTestAndRestore(cameraControl, property, delta) ? 0 : 7;

                                {
                                    Console.Error.WriteLine("USAGE: PixyCameraControlDiagnostic.exe [--verify-set pan|tilt|zoom] [--move-test pan|tilt|zoom signed-delta]");
                                    return 5;
                                }
                            }
                            finally
                            {
                                Marshal.Release(cameraControlPointer);
                            }
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

        private static void Probe(IAMCameraControl cameraControl, CameraControlProperty property)
        {
            int minimum;
            int maximum;
            int step;
            int defaultValue;
            CameraControlFlags capabilities;
            int rangeHr = cameraControl.GetRange(property, out minimum, out maximum, out step, out defaultValue, out capabilities);
            Console.WriteLine(property + ".GetRange: " + FormatHResult(rangeHr) +
                              (rangeHr >= 0 ? "; min=" + minimum + "; max=" + maximum + "; step=" + step + "; default=" + defaultValue + "; caps=" + FormatCapabilities(capabilities) : string.Empty));

            int currentValue;
            CameraControlFlags currentFlags;
            int getHr = cameraControl.Get(property, out currentValue, out currentFlags);
            Console.WriteLine(property + ".Get: " + FormatHResult(getHr) +
                              (getHr >= 0 ? "; current=" + currentValue + "; flags=" + FormatCapabilities(currentFlags) : string.Empty));
        }

        private static bool VerifySetAndRestore(IAMCameraControl cameraControl, CameraControlProperty property)
        {
            int minimum;
            int maximum;
            int step;
            int defaultValue;
            CameraControlFlags capabilities;
            int rangeHr = cameraControl.GetRange(property, out minimum, out maximum, out step, out defaultValue, out capabilities);
            if (rangeHr < 0 || step <= 0 || (capabilities & CameraControlFlags.Manual) == 0)
            {
                Console.Error.WriteLine("VERIFY " + property + ": cannot perform a safe manual write; GetRange=" + FormatHResult(rangeHr));
                return false;
            }

            int originalValue;
            CameraControlFlags originalFlags;
            int initialGetHr = cameraControl.Get(property, out originalValue, out originalFlags);
            if (initialGetHr < 0)
            {
                Console.Error.WriteLine("VERIFY " + property + ": initial Get failed: " + FormatHResult(initialGetHr));
                return false;
            }

            int testValue = originalValue + step <= maximum ? originalValue + step : originalValue - step;
            if (testValue < minimum || testValue > maximum)
            {
                Console.Error.WriteLine("VERIFY " + property + ": no in-range one-step test value is available.");
                return false;
            }

            Console.WriteLine("VERIFY " + property + ": original=" + originalValue + "; test=" + testValue + "; restore=" + originalValue);
            int setHr = cameraControl.Set(property, testValue, CameraControlFlags.Manual);
            Console.WriteLine("VERIFY " + property + ".Set(test): " + FormatHResult(setHr));
            if (setHr < 0)
                return false;

            bool testReadMatches = false;
            bool restoreReadMatches = false;
            try
            {
                int observedTestValue;
                CameraControlFlags observedTestFlags;
                int testGetHr = cameraControl.Get(property, out observedTestValue, out observedTestFlags);
                testReadMatches = testGetHr >= 0 && observedTestValue == testValue;
                Console.WriteLine("VERIFY " + property + ".Get(test): " + FormatHResult(testGetHr) +
                                  (testGetHr >= 0 ? "; current=" + observedTestValue + "; flags=" + FormatCapabilities(observedTestFlags) : string.Empty));
            }
            finally
            {
                int restoreHr = cameraControl.Set(property, originalValue, CameraControlFlags.Manual);
                Console.WriteLine("VERIFY " + property + ".Set(restore): " + FormatHResult(restoreHr));
                if (restoreHr >= 0)
                {
                    int observedRestoreValue;
                    CameraControlFlags observedRestoreFlags;
                    int restoreGetHr = cameraControl.Get(property, out observedRestoreValue, out observedRestoreFlags);
                    restoreReadMatches = restoreGetHr >= 0 && observedRestoreValue == originalValue;
                    Console.WriteLine("VERIFY " + property + ".Get(restore): " + FormatHResult(restoreGetHr) +
                                      (restoreGetHr >= 0 ? "; current=" + observedRestoreValue + "; flags=" + FormatCapabilities(observedRestoreFlags) : string.Empty));
                }
            }

            Console.WriteLine("VERIFY " + property + ": " + (testReadMatches && restoreReadMatches ? "PASS" : "FAIL"));
            return testReadMatches && restoreReadMatches;
        }

        private static bool MoveTestAndRestore(IAMCameraControl cameraControl, CameraControlProperty property, int delta)
        {
            int minimum;
            int maximum;
            int step;
            int defaultValue;
            CameraControlFlags capabilities;
            int rangeHr = cameraControl.GetRange(property, out minimum, out maximum, out step, out defaultValue, out capabilities);
            if (rangeHr < 0 || (capabilities & CameraControlFlags.Manual) == 0)
            {
                Console.Error.WriteLine("MOVE " + property + ": cannot perform a safe manual write; GetRange=" + FormatHResult(rangeHr));
                return false;
            }

            int originalValue;
            CameraControlFlags originalFlags;
            int initialGetHr = cameraControl.Get(property, out originalValue, out originalFlags);
            if (initialGetHr < 0)
            {
                Console.Error.WriteLine("MOVE " + property + ": initial Get failed: " + FormatHResult(initialGetHr));
                return false;
            }

            long targetLong = (long)originalValue + delta;
            if (targetLong < minimum || targetLong > maximum)
            {
                Console.Error.WriteLine("MOVE " + property + ": target=" + targetLong + " is outside [" + minimum + ", " + maximum + "].");
                return false;
            }

            int targetValue = (int)targetLong;
            Console.WriteLine("MOVE " + property + ": original=" + originalValue + "; target=" + targetValue + "; restore=" + originalValue);
            int setHr = cameraControl.Set(property, targetValue, CameraControlFlags.Manual);
            Console.WriteLine("MOVE " + property + ".Set(target): " + FormatHResult(setHr));
            if (setHr < 0)
                return false;

            Console.WriteLine("MOVE " + property + ": holding target for 2000 ms before restoration.");
            Thread.Sleep(2000);

            bool targetReadMatches = false;
            bool restoreReadMatches = false;
            try
            {
                int observedTargetValue;
                CameraControlFlags observedTargetFlags;
                int targetGetHr = cameraControl.Get(property, out observedTargetValue, out observedTargetFlags);
                targetReadMatches = targetGetHr >= 0 && observedTargetValue == targetValue;
                Console.WriteLine("MOVE " + property + ".Get(target): " + FormatHResult(targetGetHr) +
                                  (targetGetHr >= 0 ? "; current=" + observedTargetValue + "; flags=" + FormatCapabilities(observedTargetFlags) : string.Empty));
            }
            finally
            {
                int restoreHr = cameraControl.Set(property, originalValue, CameraControlFlags.Manual);
                Console.WriteLine("MOVE " + property + ".Set(restore): " + FormatHResult(restoreHr));
                if (restoreHr >= 0)
                {
                    int observedRestoreValue;
                    CameraControlFlags observedRestoreFlags;
                    int restoreGetHr = cameraControl.Get(property, out observedRestoreValue, out observedRestoreFlags);
                    restoreReadMatches = restoreGetHr >= 0 && observedRestoreValue == originalValue;
                    Console.WriteLine("MOVE " + property + ".Get(restore): " + FormatHResult(restoreGetHr) +
                                      (restoreGetHr >= 0 ? "; current=" + observedRestoreValue + "; flags=" + FormatCapabilities(observedRestoreFlags) : string.Empty));
                }
            }

            Console.WriteLine("MOVE " + property + ": " + (targetReadMatches && restoreReadMatches ? "PASS" : "FAIL"));
            return targetReadMatches && restoreReadMatches;
        }

        private static bool TryParseProperty(string text, out CameraControlProperty property)
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
