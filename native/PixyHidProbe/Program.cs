using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;
using Microsoft.Win32;

namespace PixyHidProbe
{
    // HID diagnostic for EMEET PIXY (VID_328F PID_00C0).
    // Safe subset first: enumeration + capabilities are pure reads (no USB writes).
    // 'query' sends an Output Report matching the decoded vendor protocol and reads the Input Report response.
    internal static class Program
    {
        private static readonly Guid HidInterfaceClass = new Guid("{4D1E55B2-F16F-11CF-88CB-001111000030}");

        private const string PixyVidPid = "VID_328F&PID_00C0";
        private const int ReportLength = 32; // vendor HID reports are 32 bytes (report id 0x09 + 31).

        private static int Main(string[] args)
        {
            try
            {
                List<string> paths = new List<string>();
                bool pathOverride = false;
                if (args.Length == 0)
                {
                    Console.Error.WriteLine("USAGE: PixyHidProbe.exe");
                    Console.Error.WriteLine("  --path <full>      use an explicit HID device path");
                    Console.Error.WriteLine("  list                - enumerate PIXY HID interfaces + capabilities");
                    Console.Error.WriteLine("  info <index>        - detailed capabilities for one interface");
                    Console.Error.WriteLine("  query <hex>         - send a 32-byte output report (padded), print response hex");
                    Console.Error.WriteLine("  poll <ms>           - read input reports for <ms> (milliseconds)");
                    return 1;
                }

                if (args[0] == "--path")
                {
                    if (args.Length < 2)
                    {
                        Console.Error.WriteLine("ERROR: --path requires a device path.");
                        return 1;
                    }
                    paths.Add(args[1]);
                    pathOverride = true;
                }
                else
                {
                    paths = EnumeratePixyHidPaths();
                    if (paths.Count == 0)
                        paths = EnumeratePixyHidPathsFromRegistry();
                }

                if (paths.Count == 0)
                {
                    Console.Error.WriteLine("ERROR: no PIXY HID interface found.");
                    return 2;
                }

                Console.WriteLine("using " + paths.Count + " PIXY HID interface(s)"
                    + (pathOverride ? " (explicit path)" : ""));

                // command is args[0], or args[2] when --path <path> prefixes the command
                int commandPosition = pathOverride ? 2 : 0;
                if (commandPosition >= args.Length)
                {
                    Console.Error.WriteLine("ERROR: missing command after --path.");
                    return 1;
                }
                string command = args[commandPosition].ToLowerInvariant();

                if (command == "list")
                {
                    for (int i = 0; i < paths.Count; i++)
                        PrintInterfaceInfo(i, paths[i]);
                    return 0;
                }

                if (command == "info")
                {
                    int index = ReadIndex(args, paths.Count, commandPosition + 1);
                    PrintInterfaceInfo(index, paths[index]);
                    PrintCapabilities(paths[index]);
                    return 0;
                }

                if (command == "query")
                {
                    if (commandPosition + 1 >= args.Length)
                    {
                        Console.Error.WriteLine("usage: query <hex>");
                        return 1;
                    }
                    byte[] report = ParseHex(args[commandPosition + 1], ReportLength);
                    int index = (args.Length >= commandPosition + 3)
                        ? ReadIndex(args, paths.Count, commandPosition + 2) : 0;
                    byte[] response = SendQuery(paths[index], report);
                    DumpHex("QUERY", report);
                    DumpHex("RESP", response);
                    return 0;
                }

                if (command == "poll")
                {
                    int timeoutMs = 3000;
                    if (args.Length >= commandPosition + 2) int.TryParse(args[commandPosition + 1], out timeoutMs);
                    int index = (args.Length >= commandPosition + 3)
                        ? ReadIndex(args, paths.Count, commandPosition + 2) : 0;
                    PollInputs(paths[index], timeoutMs);
                    return 0;
                }

                Console.Error.WriteLine("ERROR: unknown command '" + args[0] + "'.");
                return 1;
            }
            catch (Exception exception)
            {
                Console.Error.WriteLine("ERROR: " + exception.Message);
                return 3;
            }
        }

        private static int ReadIndex(string[] args, int count, int position = 1)
        {
            int index;
            if (!int.TryParse(args[position], out index) || index < 0 || index >= count)
            {
                Console.Error.WriteLine("ERROR: interface index must be 0.." + (count - 1) + ".");
                throw new ArgumentException("bad index");
            }
            return index;
        }

        // ---------------- SetupAPI enumeration ----------------

        private const int DIGCF_PRESENT = 0x00000002;
        private const int DIGCF_DEVICEINTERFACE = 0x00000010;

        [StructLayout(LayoutKind.Sequential)]
        private struct SP_DEVINFO_DATA
        {
            public uint cbSize;
            public Guid ClassGuid;
            public uint DevInst;
            public IntPtr Reserved;
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct SP_DEVICE_INTERFACE_DATA
        {
            public uint cbSize;
            public Guid InterfaceClassGuid;
            public uint Flags;
            public IntPtr Reserved;
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct SP_DEVICE_INTERFACE_DETAIL_DATA
        {
            public uint cbSize;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 512)]
            public string DevicePath;
        }

        [DllImport("setupapi.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern IntPtr SetupDiGetClassDevs(
            ref Guid classGuid, string enumerator, IntPtr hwndParent, uint flags);

        [DllImport("setupapi.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern bool SetupDiEnumDeviceInterfaces(
            IntPtr deviceInfoSet, IntPtr deviceInfoData, ref Guid interfaceClassGuid,
            uint memberIndex, ref SP_DEVICE_INTERFACE_DATA deviceInterfaceData);

        [DllImport("setupapi.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern bool SetupDiGetDeviceInterfaceDetail(
            IntPtr deviceInfoSet, ref SP_DEVICE_INTERFACE_DATA deviceInterfaceData,
            IntPtr deviceInterfaceDetailData, uint deviceInterfaceDetailDataSize,
            out uint requiredSize, IntPtr deviceInfoData);

        [DllImport("setupapi.dll", SetLastError = true)]
        private static extern bool SetupDiDestroyDeviceInfoList(IntPtr deviceInfoSet);

        private static List<string> EnumeratePixyHidPaths()
        {
            List<string> paths = new List<string>();
            Guid hidInterfaceClass = HidInterfaceClass;
            IntPtr deviceInfoSet = SetupDiGetClassDevs(ref hidInterfaceClass, null, IntPtr.Zero,
                DIGCF_PRESENT | DIGCF_DEVICEINTERFACE);
            if (deviceInfoSet == new IntPtr(-1) || deviceInfoSet == IntPtr.Zero)
            {
                int error = Marshal.GetLastWin32Error();
                throw new InvalidOperationException("SetupDiGetClassDevs failed win32=" + error);
            }

            try
            {
                SP_DEVICE_INTERFACE_DATA interfaceData = new SP_DEVICE_INTERFACE_DATA();
                interfaceData.cbSize = (uint)Marshal.SizeOf(typeof(SP_DEVICE_INTERFACE_DATA));
                uint index = 0;
                while (SetupDiEnumDeviceInterfaces(deviceInfoSet, IntPtr.Zero, ref hidInterfaceClass, index, ref interfaceData))
                {
                    uint required;
                    bool ok = SetupDiGetDeviceInterfaceDetail(deviceInfoSet, ref interfaceData,
                        IntPtr.Zero, 0, out required, IntPtr.Zero);
                    int error = ok ? 0 : Marshal.GetLastWin32Error();
                    if (!ok && error != 122) // ERROR_INSUFFICIENT_BUFFER
                    {
                        index++;
                        continue;
                    }

                    IntPtr detailBuffer = Marshal.AllocHGlobal((int)required);
                    try
                    {
                        // cbSize header is a DWORD; the DevicePath starts right after it.
                        // Rather than assume the alignment, locate the "\??\" (5C 5C 3F 5C)
                        // prefix inside the returned buffer and decode UTF-16 from there.
                        Marshal.WriteInt32(detailBuffer, 4);
                        if (SetupDiGetDeviceInterfaceDetail(deviceInfoSet, ref interfaceData,
                                detailBuffer, required, out required, IntPtr.Zero))
                        {
                            byte[] raw = new byte[required];
                            Marshal.Copy(detailBuffer, raw, 0, (int)required);
                            int start = 0;
                            for (int i = 0; i + 4 <= raw.Length; i++)
                            {
                                if (raw[i] == 0x5C && raw[i + 1] == 0x00 && raw[i + 2] == 0x5C && raw[i + 3] == 0x00)
                                {
                                    start = i;
                                    break;
                                }
                            }
                            string devicePath = System.Text.Encoding.Unicode.GetString(raw, start, raw.Length - start);
                            int nul = devicePath.IndexOf('\0');
                            if (nul >= 0) devicePath = devicePath.Substring(0, nul);
                            Console.WriteLine("enumerated: " + devicePath);
                            if (devicePath.IndexOf(PixyVidPid, StringComparison.OrdinalIgnoreCase) >= 0)
                                paths.Add(devicePath);
                        }
                    }
                    finally
                    {
                        Marshal.FreeHGlobal(detailBuffer);
                    }
                    index++;
                }
            }
            finally
            {
                SetupDiDestroyDeviceInfoList(deviceInfoSet);
            }
            return paths;
        }

        // SetupAPI may enumerate only legacy interfaces; fall back to a direct
        // DeviceClasses registry scan for interfaces that expose GUID_DEVINTERFACE_HID.
        private static List<string> EnumeratePixyHidPathsFromRegistry()
        {
            List<string> paths = new List<string>();
            string guidText = HidInterfaceClass.ToString().ToUpperInvariant();
            string root = @"SYSTEM\CurrentControlSet\Control\DeviceClasses\{" + guidText + "}";
            using (RegistryKey key = Registry.LocalMachine.OpenSubKey(root))
            {
                if (key == null) return paths;
                foreach (string sub in key.GetSubKeyNames())
                {
                    if (sub.IndexOf("VID_328F&PID_00C0", StringComparison.OrdinalIgnoreCase) < 0)
                        continue;
                    // DeviceClasses subkeys store the path with '##?' standing for the NT '\??\'
                    // prefix ('\\?\' in Win32) followed by '#', i.e. '#HID#...' body.
                    string devicePath = sub.StartsWith("##?#")
                        ? "\\\\?\\" + sub.Substring(4)
                        : "\\\\?\\" + sub;
                    Console.WriteLine("registry: " + devicePath);
                    paths.Add(devicePath);
                }
            }
            return paths;
        }

        // ---------------- HID open / attributes / capabilities ----------------

        private const uint GENERIC_READ = 0x80000000;
        private const uint GENERIC_WRITE = 0x40000000;
        private const uint FILE_SHARE_READ = 0x00000001;
        private const uint FILE_SHARE_WRITE = 0x00000002;
        private const uint OPEN_EXISTING = 3;
        private const uint FILE_FLAG_OVERLAPPED = 0x40000000;
        private static readonly IntPtr InvalidHandleValue = new IntPtr(-1);

        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern IntPtr CreateFile(string name, uint desiredAccess, uint shareMode,
            IntPtr securityAttributes, uint creationDisposition, uint flagsAndAttributes, IntPtr template);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool CloseHandle(IntPtr handle);

        [StructLayout(LayoutKind.Sequential)]
        private struct HIDD_ATTRIBUTES
        {
            public uint Size;
            public ushort VendorID;
            public ushort ProductID;
            public ushort VersionNumber;
        }

        [DllImport("hid.dll", SetLastError = true)]
        private static extern bool HidD_GetAttributes(IntPtr device, ref HIDD_ATTRIBUTES attributes);

        [DllImport("hid.dll", SetLastError = true)]
        private static extern bool HidD_GetPreparsedData(IntPtr device, out IntPtr preparsedData);

        [DllImport("hid.dll", SetLastError = true)]
        private static extern bool HidD_FreePreparsedData(IntPtr preparsedData);

        [StructLayout(LayoutKind.Sequential)]
        private struct HIDP_CAPS
        {
            public ushort Usage;
            public ushort UsagePage;
            public ushort InputReportByteLength;
            public ushort OutputReportByteLength;
            public ushort FeatureReportByteLength;
            [MarshalAs(UnmanagedType.ByValArray, SizeConst = 17)]
            public ushort[] Reserved;
            public ushort NumberLinkCollectionNodes;
            public ushort NumberInputButtonCaps;
            public ushort NumberInputValueCaps;
            public ushort NumberInputDataIndices;
            public ushort NumberOutputButtonCaps;
            public ushort NumberOutputValueCaps;
            public ushort NumberOutputDataIndices;
            public ushort NumberFeatureButtonCaps;
            public ushort NumberFeatureValueCaps;
            public ushort NumberFeatureDataIndices;
            public ushort NumberUnknownCaps;
            public ushort Reserved2;
        }

        [DllImport("hid.dll", SetLastError = true)]
        private static extern int HidP_GetCaps(IntPtr preparsedData, out HIDP_CAPS capabilities);

        private static IntPtr OpenPixyHid(string path)
        {
            IntPtr handle = CreateFile(path, GENERIC_READ | GENERIC_WRITE,
                FILE_SHARE_READ | FILE_SHARE_WRITE, IntPtr.Zero, OPEN_EXISTING,
                FILE_FLAG_OVERLAPPED, IntPtr.Zero);
            if (handle == InvalidHandleValue)
            {
                int error = Marshal.GetLastWin32Error();
                throw new InvalidOperationException("CreateFile on HID path failed win32=" + error +
                    " (error 5 = access denied, device may be exclusively held)");
            }
            return handle;
        }

        private static HIDD_ATTRIBUTES ReadAttributes(IntPtr handle)
        {
            HIDD_ATTRIBUTES attributes = new HIDD_ATTRIBUTES();
            attributes.Size = (uint)Marshal.SizeOf(typeof(HIDD_ATTRIBUTES));
            if (!HidD_GetAttributes(handle, ref attributes))
                throw new InvalidOperationException("HidD_GetAttributes failed");
            return attributes;
        }

        private static HIDP_CAPS ReadCapabilities(IntPtr handle)
        {
            IntPtr preparsed;
            if (!HidD_GetPreparsedData(handle, out preparsed))
                throw new InvalidOperationException("HidD_GetPreparsedData failed");

            try
            {
                // HidP_GetCaps returns HIDP_STATUS_SUCCESS which is 0x110000, not 0.
                HIDP_CAPS caps;
                int status = HidP_GetCaps(preparsed, out caps);
                if (status != 0 && status != 0x110000)
                    throw new InvalidOperationException("HidP_GetCaps failed status=" + status.ToString("X8"));
                return caps;
            }
            finally
            {
                HidD_FreePreparsedData(preparsed);
            }
        }

        private static void PrintInterfaceInfo(int index, string path)
        {
            IntPtr handle = OpenPixyHid(path);
            try
            {
                HIDD_ATTRIBUTES attributes = ReadAttributes(handle);
                HIDP_CAPS caps = ReadCapabilities(handle);
                Console.WriteLine("[" + index + "] path=" + path);
                Console.WriteLine("    vendorId=" + attributes.VendorID.ToString("X4") +
                    " productId=" + attributes.ProductID.ToString("X4") +
                    " version=" + attributes.VersionNumber.ToString("X4"));
                Console.WriteLine("    usagePage=" + caps.UsagePage.ToString("X4") +
                    " usage=" + caps.Usage.ToString("X4") +
                    " inputLen=" + caps.InputReportByteLength +
                    " outputLen=" + caps.OutputReportByteLength +
                    " featureLen=" + caps.FeatureReportByteLength);
                Console.WriteLine("    caps: inValues=" + caps.NumberInputValueCaps +
                    " outValues=" + caps.NumberOutputValueCaps +
                    " featValues=" + caps.NumberFeatureValueCaps +
                    " unknown=" + caps.NumberUnknownCaps);
            }
            finally
            {
                CloseHandle(handle);
            }
        }

        private static void PrintCapabilities(string path)
        {
            IntPtr handle = OpenPixyHid(path);
            try
            {
                HIDP_CAPS caps = ReadCapabilities(handle);
                Console.WriteLine("CAPS dump");
                Console.WriteLine("  usage=" + caps.Usage.ToString("X4") + " usagePage=" + caps.UsagePage.ToString("X4"));
                Console.WriteLine("  inputReportByteLength=" + caps.InputReportByteLength);
                Console.WriteLine("  outputReportByteLength=" + caps.OutputReportByteLength);
                Console.WriteLine("  featureReportByteLength=" + caps.FeatureReportByteLength);
                Console.WriteLine("  input buttonCaps=" + caps.NumberInputButtonCaps + " valueCaps=" + caps.NumberInputValueCaps + " dataIndices=" + caps.NumberInputDataIndices);
                Console.WriteLine("  output buttonCaps=" + caps.NumberOutputButtonCaps + " valueCaps=" + caps.NumberOutputValueCaps + " dataIndices=" + caps.NumberOutputDataIndices);
                Console.WriteLine("  feature buttonCaps=" + caps.NumberFeatureButtonCaps + " valueCaps=" + caps.NumberFeatureValueCaps + " dataIndices=" + caps.NumberFeatureDataIndices);
                Console.WriteLine("  linkCollectionNodes=" + caps.NumberLinkCollectionNodes + " unknownCaps=" + caps.NumberUnknownCaps);
            }
            finally
            {
                CloseHandle(handle);
            }
        }

        // ---------------- overlapped I/O ----------------

        [StructLayout(LayoutKind.Sequential)]
        private struct OVERLAPPED
        {
            public IntPtr Internal;
            public IntPtr InternalHigh;
            public uint Offset;
            public uint OffsetHigh;
            public IntPtr hEvent;
        }

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool ReadFile(IntPtr handle, byte[] buffer, int numberOfBytesToRead,
            out int numberOfBytesRead, ref OVERLAPPED overlapped);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool WriteFile(IntPtr handle, byte[] buffer, int numberOfBytesToWrite,
            out int numberOfBytesWritten, ref OVERLAPPED overlapped);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool GetOverlappedResult(IntPtr handle, ref OVERLAPPED overlapped,
            out int numberOfBytesTransferred, bool wait);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);

        private const uint WAIT_OBJECT_0 = 0;
        private const uint WAIT_TIMEOUT = 0x00000102;
        private const uint ERROR_IO_PENDING = 997;

        [StructLayout(LayoutKind.Sequential)]
        private struct SECURITY_ATTRIBUTES
        {
            public uint nLength;
            public IntPtr lpSecurityDescriptor;
            public bool bInheritHandle;
        }

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern IntPtr CreateEvent(IntPtr lpEventAttributes, bool bManualReset,
            bool bInitialState, string lpName);

        private static byte[] ReadInputReport(IntPtr handle, int timeoutMs)
        {
            byte[] buffer = new byte[ReportLength];
            OVERLAPPED overlapped = new OVERLAPPED();
            IntPtr cleanupHandle = IntPtr.Zero;
            try
            {
                cleanupHandle = CreateEvent(IntPtr.Zero, true, false, null);
                overlapped.hEvent = cleanupHandle;

                int read;
                bool ok = ReadFile(handle, buffer, ReportLength, out read, ref overlapped);
                if (ok)
                    return TrimMatch(buffer, read);

                int error = Marshal.GetLastWin32Error();
                if (error != (int)ERROR_IO_PENDING)
                    throw new InvalidOperationException("ReadFile failed win32=" + error);

                uint wait = WaitForSingleObject(cleanupHandle, (uint)timeoutMs);
                if (wait == WAIT_TIMEOUT)
                {
                    CancelIo(handle);
                    return null; // no input report within timeout
                }

                int transferred;
                if (!GetOverlappedResult(handle, ref overlapped, out transferred, false))
                    throw new InvalidOperationException("GetOverlappedResult failed win32=" + Marshal.GetLastWin32Error());
                return TrimMatch(buffer, transferred);
            }
            finally
            {
                if (cleanupHandle != IntPtr.Zero) CloseHandle(cleanupHandle);
            }
        }

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool CancelIo(IntPtr handle);

        private static byte[] TrimMatch(byte[] buffer, int count)
        {
            byte[] result = new byte[Math.Max(count, 0)];
            Buffer.BlockCopy(buffer, 0, result, 0, result.Length);
            return result;
        }

        private static byte[] SendQuery(string path, byte[] report)
        {
            IntPtr handle = OpenPixyHid(path);
            try
            {
                // drain any stale input reports before the query
                for (int i = 0; i < 4; i++)
                {
                    byte[] stale = ReadInputReport(handle, 120);
                    if (stale == null) break;
                    DumpHex("DRAIN", stale);
                }

                OVERLAPPED overlapped = new OVERLAPPED();
                IntPtr cleanupHandle = IntPtr.Zero;
                try
                {
                    cleanupHandle = CreateEvent(IntPtr.Zero, true, false, null);
                    overlapped.hEvent = cleanupHandle;

                    int written;
                    bool ok = WriteFile(handle, report, ReportLength, out written, ref overlapped);
                    if (!ok)
                    {
                        int error = Marshal.GetLastWin32Error();
                        if (error == (int)ERROR_IO_PENDING)
                        {
                            uint wait = WaitForSingleObject(cleanupHandle, 1000);
                            if (wait == WAIT_TIMEOUT)
                            {
                                CancelIo(handle);
                                throw new InvalidOperationException("Output report send timed out");
                            }
                            if (!GetOverlappedResult(handle, ref overlapped, out written, false))
                                throw new InvalidOperationException("Output report send failed win32=" + Marshal.GetLastWin32Error());
                        }
                        else
                        {
                            throw new InvalidOperationException("WriteFile failed win32=" + error +
                                " (5=access denied, 87=bad report size, 121=semaphore timeout)");
                        }
                    }

                    byte[] response = ReadInputReport(handle, 2000);
                    if (response == null)
                        throw new InvalidOperationException("no input report response within 2000 ms");
                    return response;
                }
                finally
                {
                    if (cleanupHandle != IntPtr.Zero) CloseHandle(cleanupHandle);
                }
            }
            finally
            {
                CloseHandle(handle);
            }
        }

        private static void PollInputs(string path, int timeoutMs)
        {
            IntPtr handle = OpenPixyHid(path);
            try
            {
                long deadline = DateTime.UtcNow.Ticks + (long)timeoutMs * 10000;
                int count = 0;
                while (DateTime.UtcNow.Ticks < deadline)
                {
                    byte[] report = ReadInputReport(handle, 400);
                    if (report == null)
                    {
                        Console.WriteLine("(no input report)");
                        continue;
                    }
                    DumpHex("IN#" + count, report);
                    count++;
                }
                Console.WriteLine("polled " + count + " input report(s)");
            }
            finally
            {
                CloseHandle(handle);
            }
        }

        // ---------------- helpers ----------------

        private static byte[] ParseHex(string text, int paddedLength)
        {
            string cleaned = text.Replace(" ", "").Replace("0x", "").Replace(",", "");
            if (cleaned.Length % 2 != 0)
                throw new ArgumentException("hex string must have an even number of digits");
            int byteCount = cleaned.Length / 2;
            if (byteCount > paddedLength)
                throw new ArgumentException("hex string exceeds " + paddedLength + " bytes");
            byte[] result = new byte[paddedLength];
            for (int i = 0; i < byteCount; i++)
                result[i] = Convert.ToByte(cleaned.Substring(i * 2, 2), 16);
            return result;
        }

        private static void DumpHex(string label, byte[] data)
        {
            System.Text.StringBuilder builder = new System.Text.StringBuilder(label + ": ");
            foreach (byte value in data)
                builder.Append(value.ToString("X2")).Append(' ');
            Console.WriteLine(builder.ToString().TrimEnd());
        }
    }
}