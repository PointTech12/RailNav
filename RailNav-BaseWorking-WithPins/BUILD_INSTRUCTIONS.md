# Railway Navigation App - Build Instructions

## Prerequisites

1. **Node.js** (v16 or higher) - Download from https://nodejs.org/
2. **Python 3.8+** - For backend server
3. **Git** (optional) - For version control

## Installation Steps

### 1. Install Node.js Dependencies

```bash
npm install
```

This will install:
- Electron (for desktop app)
- Electron Builder (for creating .exe files)

### 2. Install Python Backend Dependencies

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate
pip install -r requirements.txt

# Linux/Mac
source venv/bin/activate
pip install -r requirements.txt
```

### 3. Build the Application

#### Build for Windows (.exe)

```bash
npm run build:win
```

This will create:
- `dist/Railway Navigator Setup.exe` - Installer
- `dist/RailwayNavigator-Portable.exe` - Portable version (no installation needed)

#### Build for All Platforms

```bash
npm run build:all
```

### 4. Run in Development Mode

```bash
npm start
```

## Mobile Compatibility

### Important Note:
**.exe files are Windows-only and cannot run on mobile devices directly.**

However, the app is built with mobile-responsive design and can be accessed on mobile devices in the following ways:

### Option 1: Mobile Web App
1. Host the application on a web server
2. Access via mobile browser
3. The app will automatically detect mobile devices and adjust the UI

### Option 2: Progressive Web App (PWA)
The app can be converted to a PWA for mobile installation:
1. Add service worker
2. Add manifest.json
3. Install on mobile home screen

### Option 3: Mobile Wrapper (Advanced)
Use frameworks like:
- **Capacitor** (recommended) - For iOS/Android native apps
- **Cordova** - Alternative mobile wrapper

## Project Structure

```
RailNav-BaseWorking-WithPins/
├── main.js                 # Electron main process
├── package.json            # Node.js dependencies
├── dashboard.html          # Main dashboard
├── gptmpa1.html           # Navigation page
├── backend/                # Python Flask backend
│   ├── app.py             # Main backend server
│   └── requirements.txt   # Python dependencies
├── assets/                 # App icons and resources
└── dist/                   # Built executables (after build)
```

## Troubleshooting

### Backend Not Starting
- Ensure Python is installed and in PATH
- Check that all Python dependencies are installed
- Verify virtual environment is activated

### Build Fails
- Ensure Node.js v16+ is installed
- Run `npm install` again
- Check that all files are present

### Mobile Issues
- Clear browser cache
- Enable location permissions
- Use HTTPS for geolocation (required by browsers)

## Development

### Running Backend Separately

```bash
cd backend
python app.py
```

Backend runs on: `http://127.0.0.1:5000`

### Testing Mobile Responsiveness

1. Open browser DevTools (F12)
2. Toggle device toolbar (Ctrl+Shift+M)
3. Select mobile device preset
4. Test the application

## Production Build

For production, ensure:
1. All environment variables are set
2. Backend dependencies are installed
3. Icons are in `assets/` folder
4. Run `npm run build:win` for Windows executable

## Support

For issues or questions, check:
- Backend logs in console
- Browser DevTools console
- Electron DevTools (if enabled)

