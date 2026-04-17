const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  loadState: () => ipcRenderer.invoke('library:load'),
  saveState: (state) => ipcRenderer.invoke('library:save', state),
  importPaths: (paths) => ipcRenderer.invoke('library:importPaths', paths),
  openPath: (targetPath) => ipcRenderer.invoke('shell:openPath', targetPath),
  showItemInFolder: (targetPath) => ipcRenderer.invoke('shell:showItemInFolder', targetPath),
  hunterSearch: (keywords, excludePaths, customDirs) => ipcRenderer.invoke('hunter:search', keywords, excludePaths, customDirs),
  hunterDefaultDirs: () => ipcRenderer.invoke('hunter:defaultDirs'),
  openDirectoryDialog: () => ipcRenderer.invoke('dialog:openDirectory'),
  filehawkCheck: (filePaths) => ipcRenderer.invoke('filehawk:check', filePaths),
  consolidateProject: (name, filePaths) => ipcRenderer.invoke('consolidate:project', name, filePaths),
});
