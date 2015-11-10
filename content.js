var _options = {};
var _bannerDIV;
var _bannerWidth = 0;
var _bannerHeight= 0;
var _previousHotkey = '';

function getById()
{
   var bannerDIV = document.getElementById(_options.detectionId);
   if(bannerDIV) 
    {
       _bannerDIV = bannerDIV;
       return true;
    }
   else return false;
}

function getByFirstDIV()
{
   var bannerDIV = document.body.children[0];
   if(bannerDIV) 
   {
       if(bannerDIV.style.width && bannerDIV.style.height)
        {
            _bannerWidth = parseInt(bannerDIV.style.width);
            _bannerHeight = parseInt(bannerDIV.style.height)
            _bannerDIV = bannerDIV;
            return true
        }
        else
        {
          return false
        }
    }
   else return false;
}

function getPageInfo () 
{
    _bannerWidth = 0;
    _bannerHeight = 0;
    _bannerDIV = undefined;

    if(_options.detectionMode=='id')
    {
       if(!getById())
       {
          //getByFirstDIV();
       }
    }
    else if(_options.detectionMode=='firstdiv')
    {
        getByFirstDIV();
    }
    else if(_options.detectionMode=='automatic')
    {
        
    }
   
    console.log('_options.detectionMode: '+_options.detectionMode)
    console.log('_bannerWidth: '+_bannerWidth)
    var isTransparent=false;
    var bkColorHex = document.body.style.backgroundColor;
   	if(!bkColorHex) 
   	{
   		//no backgroundcolor set so white
   		bkColorHex = "#ffffff";
   	}
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
      
      console.log('suggestedFileName'+suggestedFileName)
      console.log('urlSplit'+urlSplit)
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
        retina:isRetina(),
        bgColor:bkColor,
        width:_bannerWidth,
        height:_bannerHeight}, function(response) 
        {
    			console.log('message sent: '+response.status)
    	  });
}

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) 
{
    console.log('request.action: '+request.action);

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
       Mousetrap.unbind('ctrl+shift+'+_previousHotkey.toString().toLowerCase());
    }
    console.log('binding to: '+'ctrl+shift+'+_options.hotkey.toString().toLowerCase())
    Mousetrap.bind('ctrl+shift+'+_options.hotkey.toString().toLowerCase(), function(e) {
    chrome.runtime.sendMessage({
        senderID:'content',
        action:'screenshot'
        }, function(response) 
        {
          console.log('message sent: '+response.status)
        });
    return false;
    });
    _previousHotkey = _options.hotkey;
}



//getPageInfo();

