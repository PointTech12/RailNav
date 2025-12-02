const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let mainWindow;
let backendProcess;

function createWindow() {
  // Create the browser window with mobile-responsive settings
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      webSecurity: true
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    show: false,
    backgroundColor: '#f8fafc'
  });

  // Load the dashboard
  const indexPath = path.join(__dirname, 'dashboard.html');
  mainWindow.loadFile(indexPath);

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    // Open DevTools in development
    if (process.env.NODE_ENV === 'development') {
      mainWindow.webContents.openDevTools();
    }
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    require('electron').shell.openExternal(url);
    return { action: 'deny' };
  });

  // Mobile-responsive: Detect if running on mobile device or small screen
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.executeJavaScript(`
      // Add mobile detection and responsive handling
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                       window.innerWidth < 768;
      
      if (isMobile) {
        document.body.classList.add('mobile-device');
        // Adjust viewport for mobile
        const viewport = document.querySelector('meta[name="viewport"]');
        if (viewport) {
          viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
        }
      }
    `);
  });
}

function startBackend() {
  const backendPath = path.join(__dirname, 'backend');
  const pythonScript = path.join(backendPath, 'app.py');
  
  // Check if Python is available
  const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';
  
  // Check if virtual environment exists
  const venvPython = process.platform === 'win32' 
    ? path.join(backendPath, 'venv', 'Scripts', 'python.exe')
    : path.join(backendPath, 'venv', 'bin', 'python');
  
  let pythonExecutable = pythonCommand;
  if (fs.existsSync(venvPython)) {
    pythonExecutable = venvPython;
  }
  
  console.log(`Starting backend with: ${pythonExecutable}`);
  
  backendProcess = spawn(pythonExecutable, [pythonScript], {
    cwd: backendPath,
    stdio: 'inherit',
    shell: true
  });
  
  backendProcess.on('error', (error) => {
    console.error('Failed to start backend:', error);
    // Try with system Python as fallback
    if (pythonExecutable !== pythonCommand) {
      console.log('Trying with system Python...');
      backendProcess = spawn(pythonCommand, [pythonScript], {
        cwd: backendPath,
        stdio: 'inherit',
        shell: true
      });
    }
  });
  
  backendProcess.on('exit', (code) => {
    console.log(`Backend process exited with code ${code}`);
  });
}

// App event handlers
app.whenReady().then(() => {
  createWindow();
  startBackend();
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Stop backend process
  if (backendProcess) {
    backendProcess.kill();
  }
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  // Ensure backend is stopped
  if (backendProcess) {
    backendProcess.kill();
  }
});

// Handle IPC messages
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

