/// <reference types="vite/client" />

interface FilePickerAcceptType {
  description?: string;
  accept: Record<string, string[]>;
}

interface OpenFilePickerOptions {
  types?: FilePickerAcceptType[];
  multiple?: boolean;
}

interface DirectoryPickerOptions {
  id?: string;
  mode?: "read" | "readwrite";
  startIn?: string | FileSystemHandle;
}

interface FileSystemHandlePermissionDescriptor {
  mode?: "read" | "readwrite";
}

// queryPermission / requestPermission 不在标准 lib.dom 里，按可选方法声明
interface FileSystemHandle {
  queryPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  requestPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
}

interface Window {
  showOpenFilePicker?: (options?: OpenFilePickerOptions) => Promise<FileSystemFileHandle[]>;
  showDirectoryPicker?: (options?: DirectoryPickerOptions) => Promise<FileSystemDirectoryHandle>;
}

// 拖进来的东西要拿真句柄（能读写磁盘），而不是只读的 File。
// 这个方法还没进标准 lib.dom，按可选方法声明。
interface DataTransferItem {
  getAsFileSystemHandle?(): Promise<FileSystemHandle | null>;
}

// vite.config.ts 的 define 在编译期塞进来的版本号，源头是 package.json
declare const __APP_VERSION__: string;
