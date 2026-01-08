const DEBUG = false;
const log = DEBUG ? console.log.bind(console, '[DD Studio]') : () => {};

var _options = {};
var _bannerDIV;
var _bannerWidth = 0;
var _bannerHeight= 0;
var _previousHotkey = '';

function getPageInfo () 
{
    _bannerWidth = 0;
    _bannerHeight = 0;
    _bannerDIV = undefined;

    if(_options.detectionMode=='id')
    {
       _bannerDIV = document.querySelector(_options.detectionId);
       if (_bannerDIV) {
           const styles = window.getComputedStyle(_bannerDIV);
           _bannerWidth = parseInt(styles.width);
           _bannerHeight = parseInt(styles.height);
       }
    }
    if(_options.detectionMode=='firstdiv' || _bannerDIV==undefined && _options.detectionMode!='automatic')
    {
        _bannerDIV = document.body.children[0];
        if(_bannerDIV.style.width && _bannerDIV.style.height)
        {
            _bannerWidth = parseInt(_bannerDIV.style.width);
            _bannerHeight = parseInt(_bannerDIV.style.height)
        }
    }
    if(_options.detectionMode=='automatic' || _bannerDIV==undefined)
    {
        // gets done in background.js
    }
   
    var isTransparent=false;
    var bkColorHex = document.body.style.backgroundColor;
   	if(!bkColorHex) 
   	{
   		//no backgroundcolor set so white
   		bkColorHex = "#ffffff";
   	}
    log('bkColorHex: ' + bkColorHex);
   var bkColor=hexToRgb(bkColorHex);
   var currentUrl = window.location.href;
   var urlSplit = currentUrl.split('/');
   var suggestedFileName = '';
   var parentFolder = '';
   if(urlSplit[urlSplit.length-1].indexOf('.html')==-1)
   {
      if(urlSplit[urlSplit.length-1]=='')
      {
        //url ends on / so an extra white space is added so -2
        suggestedFileName = urlSplit[urlSplit.length-2];
      }
      else
      {
        suggestedFileName = urlSplit[urlSplit.length-1];
      }
   }
   else 
   {
      suggestedFileName = urlSplit[urlSplit.length-2];
   }
   for(var i=0;i<urlSplit.length-1;i++)
   {
       parentFolder+=urlSplit[i]+'/';
   }
   if(urlSplit[urlSplit.length-1].indexOf('.html')==-1)
   {
       parentFolder+=urlSplit[urlSplit.length-1]+'/';
   }
   chrome.runtime.sendMessage({
        senderID:'content',
        action:'info',
        parentFolder:parentFolder,
        suggestedFileName:suggestedFileName,
        currentUrl:currentUrl,
        devicePixelRatio:window.devicePixelRatio,
        bgColor:bkColor,
        width:_bannerWidth,
        height:_bannerHeight}, function(response) 
        {
    			 //console.log('message sent: '+response.status)
    	  });
}

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) 
{
    if(request.action =='info')
    {
      for(var item in request.options)
      {
          _options[item] = request.options[item];
      }
       getPageInfo();
    }
    if(request.action =='hotkey')
    {
        _options.hotkey = request.hotkey;
        setHotkey();
    }
    sendResponse({status: "ok"})
});


function hexToRgb(hex) 
{
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

function isRetina ()
{
    var mediaQuery = "(-webkit-min-device-pixel-ratio: 1.5),\
            (min--moz-device-pixel-ratio: 1.5),\
            (-o-min-device-pixel-ratio: 3/2),\
            (min-resolution: 1.5dppx)";
    if (window.devicePixelRatio > 1)
        return true;
    if (window.matchMedia && window.matchMedia(mediaQuery).matches)
        return true;
    return false;
};

function setHotkey()
{
    if(_previousHotkey!="")
    {
       Mousetrap.unbind('mod+shift+'+_previousHotkey.toString().toLowerCase());
    }
    var hotkey = _options.hotkey || 'S';
    log('Binding hotkey Cmd/Ctrl+Shift+' + hotkey);
    Mousetrap.bind('mod+shift+'+hotkey.toString().toLowerCase(), function() {
        log('Hotkey pressed, taking screenshot');
        chrome.runtime.sendMessage({
            senderID:'content',
            action:'screenshot'
        }, function() {
            log('Screenshot message sent');
        });
        return false;
    });
    _previousHotkey = hotkey;
}

// Initialize on page load
(function init() {
    // Set default hotkey immediately
    _options.hotkey = 'S';
    setHotkey();

    // Request current options from background
    chrome.runtime.sendMessage({
        senderID: 'content',
        action: 'getOptions'
    }, function(response) {
        if (response && response.options) {
            _options = response.options;
            setHotkey();
        }
    });
})();

