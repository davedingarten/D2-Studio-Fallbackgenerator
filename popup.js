var _keysPressed = [];
var _keysPressedAmount = 0;
var _options = {};
var _keysDown = {};
var _allowedKeys = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
_allowedKeys = _allowedKeys.split("");

function init()
{
	var selectOptions = [];
	for(var i=0;i<_allowedKeys.length;i++)
	{
		selectOptions.push('<option value="'+ i +'">'+ _allowedKeys[i] +'</option>')
	}
	$('#select_hotkey').html(selectOptions.join(''));

	var bkg


	chrome.runtime.getBackgroundPage(function(backgroundPage) 
	{
	   
	    bkg = backgroundPage;
		
		for(var item in bkg._options)
		{
			_options[item] = bkg._options[item];
		}

		 $('#version').html('v'+bkg._version)
		 $('#input_detection_id').val(_options.detectionId)

		$('input[name=input_quality]').val(_options.quality);
		$('input[name=input_filesize]').val(_options.maxFileSize);
		
		var outputId = 0;
		for(var i=0;i<bkg._outputModes.length;i++)
		{
			if(_options.outputMode==bkg._outputModes[i].type) outputId = i;
		}

		$("input[name=output][value='"+outputId+"']").prop("checked",true);
		
		var detectionId = 0;
		for(var i=0;i<bkg._detectionModes.length;i++)
		{
			if(_options.detectionMode==bkg._detectionModes[i].type) detectionId = i;
		}
		$("input[name=detection][value='"+detectionId+"']").prop("checked",true);

		if(_options.outputMode!='JPG')
		{
			disable('holder_optimizing')
		}
		else
		{
			enable('holder_optimizing')
		}

		var optimizingId = 0;
		for(var i=0;i<bkg._optimizingModes.length;i++)
		{
			if(_options.optimizingMode==bkg._optimizingModes[i].type) optimizingId = i;
		}
		$("input[name=optimizing][value='"+optimizingId+"']").prop("checked",true);

		$("input[name=saveAs]").prop("checked",_options.saveAs);

		
		$('#select_hotkey option[value='+getValueHotkey(_options.hotkey)+']').attr("selected", "selected");


		$('input[type=radio]').click(function() {

		 switch(this.name)
		  {
			case 'output':
				_options.outputMode = bkg._outputModes[this.value].type;
				if(_options.outputMode!='JPG')
				{
					disable('holder_optimizing')
				}
				else
				{
					enable('holder_optimizing')
				}
			break
			case 'detection':
				_options.detectionMode = bkg._detectionModes[this.value].type;
			break
			case 'optimizing':
				_options.optimizingMode = bkg._optimizingModes[this.value].type;
			break
		  }
		  sendNewOptions();
		});

		$('input[type=checkbox]').click(function() {

		 switch(this.name)
		  {
			case 'saveAs':
			console.log('checkedL '+$(this).prop('checked'))
				_options.saveAs = $(this).prop('checked');
			break
		  }
		  sendNewOptions();
		});

		$('input[type=text]').keyup(function() {
			
		  switch(this.name)
		  {
			case 'input_quality':
				var quality = this.value;
				if(quality >100)
				{
					quality = 100;
					$(this).val(quality)
				}
				else if(quality<1)
				{
					quality =1;
					$(this).val(quality)
				}
				_options.quality = quality;
			break
			case 'input_filesize':
				var filesize = this.value;
				if(filesize >999)
				{
					filesize = 999;
					$(this).val(filesize)
				}
				else if(filesize<1)
				{
					filesize =1;
					$(this).val(filesize)
				}
				_options.maxFileSize = filesize;
			break
			case 'input_detection_id':
				_options.detectionId = this.value;
			break
		  }
		  sendNewOptions();
		});

		$( "#select_hotkey" ).change(function() 
		{
		  	_options.hotkey = _allowedKeys[this.value];
		  	sendNewOptions();
		});

		$('input[type=text]').focus(function() {
			console.log('focucs')
		  switch(this.name)
		  {
			case 'input_quality':
				$("input[name=optimizing][value='0']").prop("checked",true);
				_options.optimizingMode = bkg._optimizingModes[0].type;
				//options.output = this.value;
			break
			case 'input_filesize':
				$("input[name=optimizing][value='1']").prop("checked",true);
				_options.optimizingMode = bkg._optimizingModes[1].type;
				//options.output = this.value;
			break
		  }
		  sendNewOptions();
		});

		$('input[type=text]').focus(function() {
			console.log('focucs')
		  switch(this.name)
		  {
			case 'input_quality':
				//options.output = this.value;
			break
		  }
		  sendNewOptions();
		});
	});
	
	function getValueHotkey(key)
	{
		for(var i=0;i<_allowedKeys.length;i++)
		{
			if(key==_allowedKeys[i]) return i;
		}
		return 0;
	}

	function disable(divId)
	{
		$('#'+divId).css({opacity:.4,pointerEvents:'none'})
	}

	function enable(divId)
	{
		$("#"+divId).css({opacity:1,pointerEvents:'auto'})
	}

	function isInArray(data,array)
	{
		var found = false;
		for(var i=0;i<array.length;i++)
		{
			if(array[i]==data) found = true;
		}
		return found;
	}

	function detectHotkey()
	{

	}

	function sendNewOptions()
	{
		chrome.runtime.sendMessage({
        senderID:'popup',
        action:'options',
        options:_options}, function(response) 
        {
    			console.log('message form popup sent: '+response.status)
    	  });
	}
}

window.onload = function() {
  init();
};