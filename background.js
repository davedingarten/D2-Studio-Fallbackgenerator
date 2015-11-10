var _id = 100;
var _viewTabUrl;
var _targetId = null;
var _retina
var _isTransparent = false;
var _bgColor;
var _currentUrl;
var _lastDownloadId;
var _lastFilename='';
var _imgWidth = 0;
var _imgHeight= 0;;
var _screenshotUrl;
var _manifest = chrome.runtime.getManifest();
var _version = _manifest.version;

var _outputModes = [
                    {type:'JPG',id:0},
                    {type:'PNG',id:1}
]
var _detectionModes = [
    {type:'id',id:0},
    {type:'firstdiv',id:1},
    {type:'automatic',id:2},
    {type:'none',id:3}
]

var _optimizingModes = [
    {type:'quality',id:0},
    {type:'filesize',id:1}
]

var _options = {
    optimizingMode:_optimizingModes[0].type,
    maxFileSize:0,
    saveAs:false,
    detectionId:'banner',
    outputMode:_outputModes[0].type,
    quality:90,
    detectionMode:_detectionModes[0].type,
    hotkey:'S',    
    retina:false,
    suggestedFileName:'',
    suggestedFileNameDefault:'fallback'
};

chrome.tabs.onUpdated.addListener(function listener(tabId, changedProps) 
{
    console.log('tab updated: '+tabId)
    
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) 
   {
        if(tabs[0].id==tabId)
        {
            sendNewHotkey();
        }
   })
});

// Listen for a click on the camera icon. On that click, take a screenshot.
chrome.browserAction.onClicked.addListener(function() 
{
    chrome.contextMenus.removeAll();
    chrome.contextMenus.create({
          title: "first",
          contexts: ["browser_action"],
          onclick: function() {
            alert('first');
          }
    });
    //startScreenshot();
});

function startScreenshot()
{
    console.log('startscreenshot')
     //get active page info
   chrome.tabs.query({active: true, currentWindow: true}, function(tabs) 
   {
      chrome.tabs.sendMessage(tabs[0].id, {action: "info",options:_options}, function(response) 
      {
            console.log('message sent');
            console.log('_options.width: '+_options.width)
            console.log('_options.height: '+_options.height)

           //make screenshot
            var type = {format:'jpeg',quality:90};
            var type = {format:'png'};


            chrome.tabs.captureVisibleTab(null,type,function(screenshotUrl) 
            {
                _screenshotUrl = screenshotUrl;
                if(_options.width==0||_options.height==0)
                {
                    //no width or height given so detecting border
                    var img = new Image();
                    img.onload = function() 
                    {
                        var canvas = document.createElement('canvas');
                        var canvasWidth = img.width
                        var canvasHeight = img.height
                        canvas.width = canvasWidth;
                        canvas.height = canvasHeight;

                        var ctx = canvas.getContext('2d');
                        ctx.drawImage(img,0,0,canvasWidth,canvasHeight);
                        var imgData=ctx.getImageData(0,0,canvasWidth,canvasHeight);
                        var data=imgData.data;
                        var pos = findEdge(data,canvasWidth,canvasHeight);
                        if(!pos.valid){return;}
                        var boundingBox = findBoundary(pos,data,canvasWidth,canvasHeight);
                        if(_options.retina)
                        {
                            boundingBox.x = Math.ceil(boundingBox.x/2);
                            boundingBox.y = Math.ceil(boundingBox.y/2);
                            boundingBox.width = Math.ceil(boundingBox.width/2);
                            boundingBox.height = Math.ceil(boundingBox.height/2);
                        }
                        cropData(_screenshotUrl,{x:boundingBox.x,y:boundingBox.y,w:boundingBox.width,h:boundingBox.height},onCropComplete);
                     };            
                    img.src = _screenshotUrl;
                }
                else
                {
                    cropData(_screenshotUrl,{x:0,y:0,w:_options.width,h:_options.height},onCropComplete);
                }        
            });
      });
    });

   
}
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) 
{
    if(request.senderID=='content')
    {
        if(request.action=='info')
        {
            for(var key in request)
            {
              _options[key] = request[key];
            }
        }
        else if(request.action=='screenshot')
        {
            startScreenshot();
        }
    }
    else if(request.senderID=='popup')
    {
        if(request.action=='options')
        {
            if(_options.hotkey!=request.options.hotkey)
            {
                sendNewHotkey()
            }
            for(var key in request.options)
            {   
                _options[key] = request.options[key];
            }
        }
    }
    
    sendResponse({status: "ok"});   
});

function sendNewHotkey()
{
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) 
   {
          chrome.tabs.sendMessage(tabs[0].id, {action: "hotkey",hotkey:_options.hotkey}, function(response) 
          {
            for(var item in response)
            {
                console.log(item +"  "+response[item])
            }
                //console.log(response)
                console.log('hotkey sent2')
          });
    });
}


chrome.commands.onCommand.addListener(function (command) {
    if (command === "save") {
        alert("save");
    }
});


function onCropComplete(dataURL)
{
    var fileName
   
    if(_options.suggestedFileName=='')
    {
        fileName = _options.suggestedFileNameDefault+'_'+_imgWidth+'x'+_imgHeight+'.'+_options.outputMode.toLowerCase();
    }
    else
    {
        fileName = _options.suggestedFileName+'.'+_options.outputMode.toLowerCase();
    }   
    
    if(_lastDownloadId && _lastFilename==fileName)
    {
         chrome.downloads.removeFile(_lastDownloadId, function (arrayItems)
         {
            console.log('deleted')
         })
    }
    _lastFilename = fileName;
    
    console.log('_options.saveAs'+_options.saveAs)
    chrome.downloads.download({
          url: dataURL,
          filename: fileName,
          saveAs:_options.saveAs
        },
        function(downloadId)
        {
            // on success
            _lastDownloadId = downloadId;
        });
}

function cropData(str, coords,callback) {
    var img = new Image();
    _imgWidth = coords.w;
    _imgHeight = coords.h;

    console.log('cropData ///  _imgWidth: '+_imgWidth+'   _imgHeight: '+_imgHeight)

    img.onload = function() 
    {
        var canvas = document.createElement('canvas');
        canvas.width = coords.w;
        canvas.height = coords.h;
        var ctx = canvas.getContext('2d');
        
        console.log('_options.retina'+_options.retina)
        if(_options.retina==true)
        {
            ctx.scale(.5,.5);
            ctx.drawImage(img, coords.x, coords.y, coords.w*2, coords.h*2, 0, 0, coords.w*2, coords.h*2);
        }
        else
        {
            ctx.scale(1,1);
            ctx.drawImage(img, coords.x, coords.y, coords.w, coords.h, 0, 0, coords.w, coords.h);
        }
        //alert(_options.quality)
        console.log('_options.quality: '+_options.quality)

        var imgType 
        console.log('_options.outputMode'+_options.outputMode)
        if(_options.outputMode=='JPG')
        {
            imgType = 'image/jpeg';
        }
        else if(_options.outputMode=='PNG')
        {
            imgType = 'image/png';
        }
        var fileSize;
        var tempQuality = _options.quality;;

        if(_options.outputMode=='JPG')
        {
            if(_options.optimizingMode=='filesize')
            {
                canvas.toBlob(function(blob){
                    fileSize = blob.size/1000;
                },"image/jpeg", _options.quality/100);

                console.log('fileSize before: '+fileSize)

                var tempQuality = _options.quality;
                var security = 0
                while(fileSize>_options.maxFileSize)
                {
                    tempQuality-=1;
                    security++;
                    if(security>100) break;
                    if(tempQuality<1) break;
                    canvas.toBlob(function(blob)
                    {
                       fileSize = blob.size/1000;
                    },"image/jpeg", tempQuality/100);
                    console.log('fileSize after: '+fileSize)
                }
            }
            else if(_options.optimizingMode=='quality')
            {
                
            }
        }
        var dataURL = canvas.toDataURL(imgType,tempQuality/100);
        callback(dataURL);
      };    
    img.src = str;
}

function xyIsInImage(data,x,y,cw,ch)
{
    // find the starting index of the r,g,b,a of pixel x,y
    var start=(y*cw+x)*4;
    if(_isTransparent){
        return(data[start+3]>25);
    }else{
        var r=data[start+0];
        var g=data[start+1];
        var b=data[start+2];
        var a=data[start+3];  // pixel alpha (opacity)
        var deltaR=Math.abs(_options.bgColor.r-r);
        var deltaG=Math.abs(_options.bgColor.g-g);
        var deltaB=Math.abs(_options.bgColor.b-b);
        return(!(deltaR<5 && deltaG<5 && deltaB<5 && a>25));
    }
}

function findBoundary(pos,data,cw,ch)
{
    var x0=x1=pos.x;
    var y0=y1=pos.y;
    while(y1<=ch && xyIsInImage(data,x1,y1,cw,ch)){y1++;}
    var x2=x1;
    var y2=y1-1;
    while(x2<=cw && xyIsInImage(data,x2,y2,cw,ch)){x2++;}
    return({x:x0,y:y0,width:x2-x0,height:y2-y0+1});
}

function findEdge(data,cw,ch)
{
    for(var y=0;y<ch;y++)
    {
        for(var x=0;x<cw;x++)
        {
            if(xyIsInImage(data,x,y,cw,ch))
            {
                return({x:x,y:y,valid:true});
            }
        }
    }
    return({x:-100,y:-100,valid:false});
}