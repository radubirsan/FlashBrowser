const {
    app,
    protocol,
    BrowserWindow,
	globalShortcut,
    Menu
} = require('electron');
// fiae function for dynamic quick error changing
function fiae(platform) {
	console.error(new Error(`IA32 arch for platform "${platform}" is not supported`));
};
const path = require('path');
const Store = require('./store.js');
const contextMenu = require('electron-context-menu');
const { ipcMain } = require('electron');
let swfURL = 'no swf'
const {download} = require('electron-dl');
contextMenu({
	showSaveImageAs: true
});

let mainWindow;

let pluginName = null; //put the right flash plugin in depending on the operating system.
switch (process.platform) {
	case 'win32':
		switch (process.arch) {
			case 'ia32':
				fiae('win32');
			case 'x32':
				pluginName = 'flashver/pepflashplayer32.dll'
				console.log("ran!");
				break
			case 'x64':
				pluginName = 'flashver/pepflashplayer64.dll'
				console.log("ran!");
				break
		}
		break
	case 'linux':
		switch (process.arch) {
			case 'ia32':
			case 'x32':
				pluginName = 'flashver/libpepflashplayer.so';
				break
			case 'x64':
				pluginName = 'flashver/libpepflashplayer.so';
				break
		}

		// SECURITY NOTE: no-sandbox is required for PPAPI Flash plugin support on Linux
		// This reduces security isolation. Only run in isolated/VM environment.
		app.commandLine.appendSwitch('no-sandbox');
		break
	case 'darwin':
		pluginName = 'flashver/PepperFlashPlayer.plugin'
		break
}
app.commandLine.appendSwitch("disable-renderer-backgrounding");
if (process.platform !== "darwin") {
	app.commandLine.appendSwitch('high-dpi-support', "1");
	//app.commandLine.appendSwitch('force-device-scale-factor', "1");
}
app.commandLine.appendSwitch("--enable-npapi");
app.commandLine.appendSwitch("--enable-logging");
app.commandLine.appendSwitch("--log-level", 4);

// SECURITY NOTE: Load PPAPI Flash plugin with error handling
try {
	const isPackaged = __dirname.includes(".asar");
	// 基础资源路径：开发环境用 __dirname，打包后用 process.resourcesPath
	const baseResourcesPath = isPackaged ? process.resourcesPath : __dirname;
	const pluginPath = path.join(baseResourcesPath, pluginName);
	app.commandLine.appendSwitch('ppapi-flash-path', pluginPath);
	// 显式指定版本号，部分 Linux 内核对版本检测很敏感
	app.commandLine.appendSwitch('ppapi-flash-version', '32.0.0.465');
	console.log(`Flash plugin loaded from: ${pluginPath}`);
} catch (error) {
	console.error('Failed to load Flash plugin:', error);
}
//app.commandLine.appendSwitch('ppapi-flash-path', path.join(__dirname.includes(".asar") ? process.resourcesPath : __dirname, "plugins/" + pluginName));

// SECURITY WARNING: The following flags reduce security isolation and are required for Flash
// - disable-site-isolation-trials: Required for PPAPI plugin content access
// - no-sandbox: Required for PPAPI plugin loading (reduces process isolation)
// - ignore-certificate-errors: Allows Flash content on sites with invalid certificates
// - allow-insecure-localhost: Allows local Flash development
// RECOMMENDATION: Only use this application in an isolated VM or sandbox environment
app.commandLine.appendSwitch('disable-site-isolation-trials');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('ignore-certificate-errors', 'true');
app.commandLine.appendSwitch('allow-insecure-localhost', 'true');

let sendWindow = (identifier, message) => {
    mainWindow.webContents.send(identifier, message);
};

const store = new Store({
  configName: 'user-preferences',
  defaults: {
    windowBounds: { width: 1280, height: 720, max:false }
  }
});

// Add error handlers to catch any unhandled errors
process.on('uncaughtException', (error) => {
	console.error('UNCAUGHT EXCEPTION:', error);
});

process.on('unhandledRejection', (reason, promise) => {
	console.error('UNHANDLED REJECTION:', reason);
});

app.on('ready',   () => {

	// Build and set menu inside ready event (required on macOS)
	const template = [
		{
		  label: 'FilterX',
		  visible:true,
		  submenu: [
			{
			  label: 'Exit FullScreen',
			  accelerator: "Esc",
			  visible:false,
			  click(item, focusedWindow) {
					if (focusedWindow.isFullScreen()) {
						focusedWindow.setFullScreen(false);
						mainWindow.webContents.send('Esc');
					}
				}
			}
		  ]
		}
	];

	try {
		const menu = Menu.buildFromTemplate(template);
		Menu.setApplicationMenu(menu);
	} catch (error) {
		console.error('ERROR building/setting menu:', error);
	}

    let { width, height, isMax } = store.get('windowBounds');
    let filePath = 'filePath';
	console.log("inti param" + process.argv);

	// SECURITY: Validate command-line arguments for SWF file paths
	if(process.argv.length >= 2 && process.argv[1].indexOf(".swf") > 1) {
		try {
			const input = process.argv[1];

			// Validate HTTP/HTTPS URLs
			if(input.indexOf("http") >= 0) {
				console.log(998 + input);
				const cleanUrl = input.replace("FlashBrowser:", "");

				// Basic URL validation to prevent malformed URLs
				if(cleanUrl.match(/^https?:\/\/.+\.swf(\?.*)?$/i)) {
					filePath = cleanUrl;
				} else {
					console.error('Invalid URL format:', cleanUrl);
				}
			}
			// Validate local file paths
			else {
				let localPath = input;
				// Sanitize path separators
				localPath = localPath.replace(/\\/g, "/");

				// Basic path traversal prevention - warn about suspicious patterns
				if(localPath.includes("../") || localPath.includes("..\\")) {
					console.warn('Warning: Path contains traversal patterns:', localPath);
				}

				filePath = 'file:///' + localPath;
			}
		} catch (error) {
			console.error('Error processing file path:', error);
			filePath = 'filePath'; // Reset to default on error
		}
	}
	if(width < 100 || height < 100) {
		width = 800;
		height = 500;
	}

    mainWindow = new BrowserWindow({
        width: width,
        height: height,
		titleBarStyle: 'hidden',
		frame: true,
		show:true,
		backgroundColor: '#202124',
        webPreferences: {
            nodeIntegration: true,
            webviewTag: true,
            plugins: true,
	    contextIsolation: false,
	    enableRemoteModule: true,
	    additionalArguments: [filePath]
        }
    });

    mainWindow.loadURL(`file://${__dirname}/browser.html`);

	// Uncomment to open DevTools for debugging:
	// mainWindow.webContents.openDevTools();

	
	// Modify the user agent for all requests to the following urls.
	const filter = {
	  urls: ['https://*.darkorbit.com/*', 'https://*.whatsapp.com/*', '*://*/*.swf']
	}

	mainWindow.webContents.session.webRequest.onBeforeSendHeaders(filter,(details, callback) => {

		if(details.url && details.url.indexOf(".swf") === -1){
		    console.log("BIGPOINT OR WHATSUP")
			details.requestHeaders['X-APP'] = app.getVersion();
			details.requestHeaders['User-Agent'] = 'BigpointClient/1.4.6';
			if(details.url.indexOf("whatsapp") > 0) {
				details.requestHeaders['User-Agent'] = "Mozilla/5.0 (Macintosh; Intel Mac OS X 11_2_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Safari/605.1.15";
			}
		}
		else{
		//	app.commandLine.appendSwitch('ppapi-flash-path', null);
         console.log("swf url", details.url)
		 swfURL = details.url
		}

        callback({ requestHeaders: details.requestHeaders })
    });

	// SECURITY: Add Content Security Policy headers for additional protection
	// Note: CSP is only applied to remote HTTP/HTTPS content, not local file:// resources
	mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
		// Only apply CSP to remote content (HTTP/HTTPS), not local files or Flash
		if(details.url && details.url.match(/^https?:\/\//i) && details.url.indexOf(".swf") === -1) {
			callback({
				responseHeaders: {
					...details.responseHeaders,
					'Content-Security-Policy': [
						"default-src 'self' 'unsafe-inline' 'unsafe-eval' https: http: data: blob:; " +
						"script-src 'self' 'unsafe-inline' 'unsafe-eval' https: http:; " +
						"object-src 'self' https: http: data:;"
					]
				}
			});
		} else {
			callback({ responseHeaders: details.responseHeaders });
		}
	});
	
    sendWindow("version", app.getVersion());
    
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
	
	
	

	
	 
	mainWindow.once('ready-to-show', () => {
		if(isMax) {	
		if(process.platform === "win32"){
			mainWindow.maximize();
			
		}
		else{
			mainWindow.setFullScreen(true)
		}
		
		
	 }
     mainWindow.show()
	})


	// Upper Limit is working of 500 %
	mainWindow.webContents.setVisualZoomLevelLimits(1, 5).then(console.log("Zoom Levels Have been Set between 100% and 500%")).catch((err) => console.log(err));
   
   
    mainWindow.on('resize', () => {
		var isMax = mainWindow.isMaximized() || mainWindow.isFullScreen()
		
		if(isMax) {
			console.log( isMax);
			let { width, height, max } = store.get('windowBounds');
			store.set('windowBounds', { width, height , isMax});		
		}
		else{
			let { width, height } = mainWindow.getBounds();
			store.set('windowBounds', { width, height , isMax});	
		}
        
    });


	
	ipcMain.on('download-button', async (event) => {
		const winX = BrowserWindow.getFocusedWindow();
		console.log( swfURL, 9921);

		await download(winX,swfURL);
   });


	app.on('browser-window-focus', () => {
			globalShortcut.register('CTRL+SHIFT+q', () => {
				console.log(22321 + enav)
				NAV.newTab('https://www.flash.pm/browser/preview', {
					close: false,
					icon: NAV.TAB_ICON,
					
				});
			});

			globalShortcut.register('CommandOrControl+F', () => {
			mainWindow.webContents.send('on-find');
			});
			
			
			//globalShortcut.register("F11", toggleWindowFullScreen);
			//globalShortcut.register("Escape", () => mainWindow.setFullScreen(true));



		

		   function toggleWindowFullScreen(){
				mainWindow.setFullScreen(!mainWindow.isFullScreen())
			}
			ipcMain.on('fullScreen-click', toggleWindowFullScreen);
			
			
			
			ipcMain.on('clearChache-click', clearCacheFunction);
			async function clearCacheFunction(){
				console.log('clearCacheFunction()!')
				await mainWindow.webContents.session.clearCache()
				.then(()=>{
					console.log('Cleared cache done! restarting..')
					app.relaunch();
					app.exit();
				})

				//console.log(22331,mainWindow.webContents.clearCache )
				//let session = mainWindow.webContents.session;
				//	mainWindow.webContents.clearCache();
				//	app.relaunch();
				//	app.exit();
			}
			
		
			globalShortcut.register("CTRL+SHIFT+I", () => {
			 mainWindow.webContents.openDevTools();
			});
			
			globalShortcut.register("CmdOrCtrl+=", () => {
				console.log("CmdOrCtrl+");
				mainWindow.webContents.zoomFactor = mainWindow.webContents.getZoomFactor() + 0.2;
			});
			globalShortcut.register("CmdOrCtrl+-", () => {
				mainWindow.webContents.zoomFactor = mainWindow.webContents.getZoomFactor() - 0.2;
			});
		
			globalShortcut.register("CTRL+SHIFT+F10", () => {
				let session = mainWindow.webContents.session;
				session.clearCache();
				app.relaunch();
				app.exit();
			});
	})

	app.on('browser-window-blur', () => {
	  globalShortcut.unregisterAll()
	})

		
	mainWindow.webContents.zoomFactor = 1;
	
		

	var {ElectronBlocker} = require('@cliqz/adblocker');
	var {fetch} = require('cross-fetch');
	//ElectronBlocker.fromPrebuiltAdsAndTracking(fetch).then((blocker)=>{	
	//	blocker.enableBlockingInSession(mainWindow.webContents.session);
	//	//console.log("--AddBlcoker started" + mainWindow.webContents.session);
	//});



	
});

app.on('open-file', (event, path) =>
{
    event.preventDefault();
    console.log(path);
});


exports.sethome = (a) => homeSetter(a);
	
function homeSetter(a){
     store.set('homepage', a );
	 console.log("Favorite url:" + a);
};

exports.setFavorite = (a) => favoriteSetter(a);
	
function favoriteSetter(a){
     let fav =  store.get('favorites');
	 if(fav && fav.indexOf(a) ==-1 ) {
	     fav.push(a);
		 store.set('favorites', fav);
		 settingsShow(true)
	 }
	 else{
		 fav =  new Array()// [a]
		 store.set('favorites', fav);
	 }
    
	 console.log("S url:" + fav.indexOf(a));
};

exports.removeAllFav = (a) => removeAllFav(a);

function removeAllFav(){
    
	 let fav2 = [] 
	
	 store.set('favorites', fav2);
	 settingsShow(true)
	 console.log("removeAllFav" );
	
};


exports.removeFav = (a) => removeFav(a);

function removeFav(a){
     let fav =  store.get('favorites');
	 let fav2 = [] 
	 for ( var i=0; i<fav.length; i++){
		if(i!=a && typeof fav[i] === 'string'){
			fav2.push(fav[i])
		}
	 }
	 store.set('favorites', fav2);
	 settingsShow(true)
	 console.log("removeFav" + a + fav2.length);
	
};

exports.showSettings = (a) => settingsShow(a);
	
function settingsShow(a){
	let fav =  store.get('favorites');
	mainWindow.webContents.send('ping', fav, a);
};


app.on('window-all-closed', () => {
    //if (process.platform !== 'darwin') {
        app.quit();
    //}
});
/*
const {autoUpdater} = require("electron-updater");

 autoUpdater.on('checking-for-update', () => {
    sendWindow('checking-for-update', '');
});

autoUpdater.on('update-available', () => {
    sendWindow('update-available', '');
});

autoUpdater.on('update-not-available', () => {
    sendWindow('update-not-available', '');
});

autoUpdater.on('error', (err) => {
    sendWindow('error', 'Error: ' + err);
});

autoUpdater.on('download-progress', (d) => {
    sendWindow('download-progress', {
        speed: d.bytesPerSecond,
        percent: d.percent,
        transferred: d.transferred,
        total: d.total
    });
});

autoUpdater.on('update-downloaded', () => {
    sendWindow('update-downloaded', 'Update downloaded');
    autoUpdater.quitAndInstall();
}); */



