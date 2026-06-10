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
  hunterQuery: (opts) => ipcRenderer.invoke('hunter:query', opts),
  filehawkLocate: (name, excludePaths, dirs) => ipcRenderer.invoke('filehawk:locate', name, excludePaths, dirs),
  journalsList: () => ipcRenderer.invoke('journals:list'),
  journalsCreate: (input) => ipcRenderer.invoke('journals:create', input),
  journalsDelete: (id) => ipcRenderer.invoke('journals:delete', id),
  foliosList: (journalId) => ipcRenderer.invoke('folios:list', journalId),
  foliosCreate: (journalId, folio) => ipcRenderer.invoke('folios:create', journalId, folio),
  foliosDelete: (id) => ipcRenderer.invoke('folios:delete', id),
  foliosUpdate: (id, patch) => ipcRenderer.invoke('folios:update', id, patch),
});
