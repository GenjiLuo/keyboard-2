define(function(require, exports, module){

	// 优化历史:
	// 1, 不需要id, 去掉btn的id, 去掉外框的id如#nu-skb-keyboard, 因为没有必要了, 不需要获取DOM, 直接通过本实例来获取里面所创建的DOM, 直接执行方法来读取数据, 改数据
	// 2, IOS中对input点击失去焦点使用disabled, 但样式不一致, 所以后来选择使用div作为容器插入text内容
	// 3, defaultConfig里不必要的属性不公开, 作为constant对象属性
	// 4, 密码显示最后一位, 设定时1秒后执行方法全显示"*"

	/**
	 * @class Keyboard
	 * @memberof Nuui
	 * @classdesc 密码键盘: 接收报文信息, 输出所点击字符对应的报文的密码键盘<br/>
	 * 		报文至少有3个属性:id, key和sequence
	 * @param {$} $target - 密码显示框的容器
	 * @param {object} config - 配置
	 * @param {string} config.title - 标题内容<br/>
	 * @param {string} config.id - 报文id<br/>
	 * @param {string} config.sequence - 报文传回的sequence<br/>
	 * @param {string} config.key - 报文<br/>
	 * @param {string} config.placeholder - 密码显示框在输入字段为空时显示的提示信息<br/>
	 * @param {bool} config.codeMode - 密码输入模式, 否则是普通输入<br/>
	 * @param {bool} config.showLast - 在密码输入模式中, 显示最后一个字母, 否则不显示所输入字符<br/>
	 * @param {int} config.displayTime - showLast模式中, 最后字符显示时间, 超时会隐藏字符<br/>
	 * @param {int} config.maxLength - 限制输入的字数<br/>
	 * @param {string} config.joinLetter - 报文之间的连接符<br/>
	 * @param {string} config.displayLetter - 遮蔽字符<br/>
	 * @param {bool} config.randomKeys - 数字键盘的随机按键模式<br/>
	 * @param {object} config.ct - 报文<br/>
	 * @param {int} config.keyboardMode - 组件模式: <br/>
	 * 		int = 1 : 数字键盘, 可输入字母;<br/>
	 * 		int = 2 : 字母键盘, 可输入数字;<br/>
	 * 		int = 3 : 数字键盘, 有小数点按键;<br/>
	 * 		int = 4 : 数字键盘;<br/>
	 * @param {view} view - 当前的view,一定要填
	 * @example App.request("key.do", {success:function(resp){
	 * 	new Keyboard($('#nu-skb-demo'), {
	 * 			id: resp.data.id,
	 * 			sequence: resp.data.sequence,
	 * 			key: resp.data.key,
	 * 			showLast:true,
	 * 			codeMode:false,
	 * 			randomKeys:true,
	 * 			keyboardMode:3
	 * 		}, view);
	 * 	}
	 * });
	 */

	var Keyboard = module.exports = function($target, config, view){

		var _this = this;

		this._$doc = view ? view.$el : $('body');
		console.log('this._$doc', this._$doc);

		this._config = $.extend({}, this._defaultConfig, config);

		//this._$input = $($target).val('').attr({'readOnly': 'readOnly', "disabled": "disabled"});
		$target.empty().append(
			this._$input = $('<div>').text(this._config.placeholder)
		);

		this._$skb = $('<div class="nu-skb-keyboard">');

		this._startEvent = ("ontouchstart" in document) ? "touchstart" : "mousedown";

		this._touchEvent = ("ontouchstart" in document) ? "touchstart" : "mousedown";

		this._id = this._config.id;

		this._spwd = [];

		// 报文数据处理
		this._calcCiphertext();

		// 生成内容
		this._renderContent();

		// 按键事件
		this._initKeyEvent();

		// 功能按键事件
		this._initModeBtnEvent();

		// 绑定展示键盘
		this._$input.on(this._touchEvent, function(){
			_this._$skb.css("bottom", 0);
		});

		// 给文档绑定退出密码键盘的事件
		this._$doc.on(this._startEvent, function(e){
			e = e.originalEvent || e;
			var target = $(e.target);
			// 检测对象为本组件时退出本方法
			//if(_this._$input.is(target) || target.parents('.nu-skb-keyboard').is(_this._$skb)){
			if(_this._$input.is(target) || target.parents('.nu-skb-container').is(_this._$main)){
				return true;
			}
			_this.hide();
		});
	};


	Keyboard.prototype = {
		// 默认值
		_defaultConfig : {
			title:"密码键盘", // 标题内容
			placeholder:"Code",
			codeMode: true,// 密码输入模式, 否则是普通输入
			showLast: true, //  密码输入模式中, 显示最后一个字母
			displayTime: 1000, // 最后一个字符的显示时间
			maxLength: 8, // 限制输入的字数
			joinLetter: '|',	 // 报文之间的连接符
			displayLetter: '*', // 遮蔽字符
			randomKeys: false,  // 是否要随机布局
			ct: {},    // 对象,对应的报文,后台查询;
			keyboardMode: 2 // 提供三种模式:1, 数字键盘模式, 可以跳转模式2字母键盘, 3,只是数字键盘不带跳转, 带有'.'与'del'按键; 4, 只是数字键盘不带跳转, 带有'del'与'确定'按键
		},

		/*
		 * 输入对象
		 * */
		_$input: null,
		/*
		 * 密码键盘对象
		 * */
		_$skb: null,
		/*
		 * 密码键盘的DOM父级
		 * */
		_$doc: null,
		/*
		* 大写模式
		* */
		_upperCase: false,
		/*
		* 数字键盘内容
		* */
		_$numbersContent: null,
		/*
		 * 字母键盘内容
		 * */
		_$lettersContent: null,
		/*
		* 延时处理input显示内容
		* */
		_setTimeFunc: null,
		/*
		* 加密后的值
		* */
		_spwd: null,
		/*
		* input显示的内容
		* */
		_displayVal: '',
		/*
		* 固定设置
		* */
		_constants:{

			_nums: [1,2,3,4,5,6,7,8,9,0],

			_letters: ['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u','v','w','x','y','z'],

			_letterline: [
				['q','w','e','r','t','y','u','i','o','p'],
				['a','s','d','f','g','h','j','k','l'],
				['upper','z','x','c','v','b','n','m','del'],
				['123', '', '确定']
			],

			// 功能按钮
			_modeLetter: {
				// 没有content的话, 默认以input:button为内容
				//'upper': {class: 'nu-skb-upper', content: '<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABwAAAAcCAYAAAByDd+UAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAyZpVFh0WE1MOmNvbS5hZG9iZS54bXAAAAAAADw/eHBhY2tldCBiZWdpbj0i77u/IiBpZD0iVzVNME1wQ2VoaUh6cmVTek5UY3prYzlkIj8+IDx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9IkFkb2JlIFhNUCBDb3JlIDUuNS1jMDIxIDc5LjE1NTc3MiwgMjAxNC8wMS8xMy0xOTo0NDowMCAgICAgICAgIj4gPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4gPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6eG1wPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvIiB4bWxuczp4bXBNTT0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL21tLyIgeG1sbnM6c3RSZWY9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZVJlZiMiIHhtcDpDcmVhdG9yVG9vbD0iQWRvYmUgUGhvdG9zaG9wIENDIDIwMTQgKFdpbmRvd3MpIiB4bXBNTTpJbnN0YW5jZUlEPSJ4bXAuaWlkOjNBNDkzMjA3RkEwODExRTQ4OEU0OTA5QzcwREFGNUJFIiB4bXBNTTpEb2N1bWVudElEPSJ4bXAuZGlkOjNBNDkzMjA4RkEwODExRTQ4OEU0OTA5QzcwREFGNUJFIj4gPHhtcE1NOkRlcml2ZWRGcm9tIHN0UmVmOmluc3RhbmNlSUQ9InhtcC5paWQ6M0E0OTMyMDVGQTA4MTFFNDg4RTQ5MDlDNzBEQUY1QkUiIHN0UmVmOmRvY3VtZW50SUQ9InhtcC5kaWQ6M0E0OTMyMDZGQTA4MTFFNDg4RTQ5MDlDNzBEQUY1QkUiLz4gPC9yZGY6RGVzY3JpcHRpb24+IDwvcmRmOlJERj4gPC94OnhtcG1ldGE+IDw/eHBhY2tldCBlbmQ9InIiPz4OzkYWAAABgUlEQVR42mL08w9kIBGIAvFmKNsbiN+SopmJRMvYgHgFEJtD8SqoGE0sZATieUDshCTmBBVjpIWFbUAcjUU8GipHVQszgbgCif8MimGgAqqGKhZ6AfFkJP5HIPaA4o9I4pOhYhRZqAvEy4CYGcr/C8ThQHwZiqOgYgxQNSugesiyUAaItwExP5JYLhDvROJvg4rBAD9UTIZUC7Fp7ADi6VjUTofK4XMoXgtB+WodWtAsBeIqPKFRBVWDHBXrsOVRbBbOQMtr+4A4CYj/47HwP1TNPrQ8OpWQhaDknYjEByWMICD+RURq/gVVexlJLAUtO6FYiJ6Bn0CzxEcSCoePUD1PcBUYLHiKqLVAbIlm4D+oODIIxhJSIDX5aEXic1CQMwJrCy0g4xiuVIWjTEWPP2J9bwVyWTMJllECQHY0gyz8zEA/8BlkYQI0mHBhdRIMVCdgVgIxhfctEiwkqJaJgc5g1MKRZ+E/IsVwAhYyHPifHj78TyU1RFu4k0pqGAACDADFW0ujK5ksUAAAAABJRU5ErkJggg==">'},
				//'del': {class: 'nu-skb-del', content: '<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACkAAAAZCAYAAACsGgdbAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAyZpVFh0WE1MOmNvbS5hZG9iZS54bXAAAAAAADw/eHBhY2tldCBiZWdpbj0i77u/IiBpZD0iVzVNME1wQ2VoaUh6cmVTek5UY3prYzlkIj8+IDx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9IkFkb2JlIFhNUCBDb3JlIDUuNS1jMDIxIDc5LjE1NTc3MiwgMjAxNC8wMS8xMy0xOTo0NDowMCAgICAgICAgIj4gPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4gPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6eG1wPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvIiB4bWxuczp4bXBNTT0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL21tLyIgeG1sbnM6c3RSZWY9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZVJlZiMiIHhtcDpDcmVhdG9yVG9vbD0iQWRvYmUgUGhvdG9zaG9wIENDIDIwMTQgKFdpbmRvd3MpIiB4bXBNTTpJbnN0YW5jZUlEPSJ4bXAuaWlkOjYxNDZCMTVFRkEwODExRTQ5NTRDQTkxRkE3RDEyODU2IiB4bXBNTTpEb2N1bWVudElEPSJ4bXAuZGlkOjYxNDZCMTVGRkEwODExRTQ5NTRDQTkxRkE3RDEyODU2Ij4gPHhtcE1NOkRlcml2ZWRGcm9tIHN0UmVmOmluc3RhbmNlSUQ9InhtcC5paWQ6NjE0NkIxNUNGQTA4MTFFNDk1NENBOTFGQTdEMTI4NTYiIHN0UmVmOmRvY3VtZW50SUQ9InhtcC5kaWQ6NjE0NkIxNURGQTA4MTFFNDk1NENBOTFGQTdEMTI4NTYiLz4gPC9yZGY6RGVzY3JpcHRpb24+IDwvcmRmOlJERj4gPC94OnhtcG1ldGE+IDw/eHBhY2tldCBlbmQ9InIiPz78YMqBAAABwUlEQVR42syXzysEYRjHZ7Qc5EApuaybPTnLEUdaubgQf4CyXJyM2o3kgpTkoDg4KOTkoPYkByfKj5KbyAH/AC2+j56pt2ln3/d5Z7aZpz7t9vbu7KeZ7/u887r5kVFHUy0g5yRXNxnNBBccgHyCkq0NmglzCQv+Vy3JXrDipKDCJNvAIWhKqyTlcA90Ca+1C24N5z6BJdMLZ2LK4TaYBu2gDHo0ggPgBXyCdemdtM3hB/gF72Cwxh1VBal++HfGklFy6IESfw8TDQrOgA2Ol5GkbQ5NRUmw30ZQlYyrH1YTPWXBVx4vSAT9hRN3P/T4c5FF1X23wAvFlbagnTr0QxKdDYxN2Qj6kiWTFSYsyuBRYOwMPNg28xOwGbOguor7lIxSNu9td5x5cFUHQXrkl4HFJBb1Jb/AGO8AcQqucQa9KKJqM38Gk5b5DPZBVTCsPdH8O5sXDAr3qlCQnsKQ0gerCaqiRUV0GHzbvAUtgAuBJLWvLdCsEXSU/lnk+fugUfcHbsgZpxNcgw6B7CPoFvRBilc2yvHhDYyDikAyJ2zUWZuFE6yyEvTUnnGolsF50pK6Iy097glwzEFPoip/AgwAtQFrRsZkjhcAAAAASUVORK5CYII=">'},
				'upper': {class: 'nu-skb-upper', content: '<img src="images/nuui-keyboard-capi0.png">'},
				'del': {class: 'nu-skb-del', content: '<img src="images/nuui-keyboard-deleteicon.png">'},
				'123': {class: 'nu-skb-changeNumberMode'},
				'abc': {class: 'nu-skb-changeLetterMode'},
				'确定': {class: 'nu-skb-confirm'},
				// 其他
				'keyDown': {class: 'nu-skb-title'},
				'space': {class: 'nu-skb-space'}
			},

			_CHARS : "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ~`!@#$%^&*()_-+={}[]|\\:;\"'<>,.?/"
		},

		_renderContent: function(){
			// 外框
			this._initWrap();

			// 初始化数字键盘
			this._createNumKey();

			if(this._config.keyboardMode < 3){
				//	// 初始化字母键盘
				this._createLetterKey();
			}

			if(this._config.keyboardMode !== 2) {
				this._$main.append(this._$numbersContent);
			}else {
				this._$main.append(this._$lettersContent);
			}

			this.hide();
		},

		_initModeBtnEvent: function(){
			var _this = this;

			function $name_bind(name, func){
				_this._$skb.on(_this._touchEvent, "." + _this._constants._modeLetter[name].class, func);
			}

			$name_bind('upper', function(){
				var imgSrc, changeCase;

				_this._upperCase = !_this._upperCase;

				if(_this._upperCase){
					changeCase = function(letter){ return letter.toUpperCase(); };
					imgSrc = "images/nuui-keyboard-capi1.png";
					//imgSrc = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABwAAAAcCAYAAAByDd+UAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAyZpVFh0WE1MOmNvbS5hZG9iZS54bXAAAAAAADw/eHBhY2tldCBiZWdpbj0i77u/IiBpZD0iVzVNME1wQ2VoaUh6cmVTek5UY3prYzlkIj8+IDx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9IkFkb2JlIFhNUCBDb3JlIDUuNS1jMDIxIDc5LjE1NTc3MiwgMjAxNC8wMS8xMy0xOTo0NDowMCAgICAgICAgIj4gPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4gPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6eG1wPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvIiB4bWxuczp4bXBNTT0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL21tLyIgeG1sbnM6c3RSZWY9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZVJlZiMiIHhtcDpDcmVhdG9yVG9vbD0iQWRvYmUgUGhvdG9zaG9wIENDIDIwMTQgKFdpbmRvd3MpIiB4bXBNTTpJbnN0YW5jZUlEPSJ4bXAuaWlkOjRBNjVCQUJCRkEwODExRTRCRTJDRjg0QTk0MzcwN0I4IiB4bXBNTTpEb2N1bWVudElEPSJ4bXAuZGlkOjRBNjVCQUJDRkEwODExRTRCRTJDRjg0QTk0MzcwN0I4Ij4gPHhtcE1NOkRlcml2ZWRGcm9tIHN0UmVmOmluc3RhbmNlSUQ9InhtcC5paWQ6NEE2NUJBQjlGQTA4MTFFNEJFMkNGODRBOTQzNzA3QjgiIHN0UmVmOmRvY3VtZW50SUQ9InhtcC5kaWQ6NEE2NUJBQkFGQTA4MTFFNEJFMkNGODRBOTQzNzA3QjgiLz4gPC9yZGY6RGVzY3JpcHRpb24+IDwvcmRmOlJERj4gPC94OnhtcG1ldGE+IDw/eHBhY2tldCBlbmQ9InIiPz6dAx+GAAABAUlEQVR42mL08w9kIBGIAvFmKNsbiN+SopmJRMvYgHgFEJtD8SqoGE0sZATieUDshCTmBBVjpIWFbUAcjUU8GipHVQszgbgCj3wFVA1VLPQC4slEqAOp8aDUQl0gXgbEzERYyAxNULrkWigDxNuAmJ+EeOaH6pEh1UKCGsl1KBOOvLaOUNAQERXrsOVRbBbOQMtr5AKQGVMJWQhK3okM1AMp6NmJidwMTG6BwURuEUVukQiyUAtXBFMRwBKiFsjCZhLzGrkAZEczyMLPDPQDn0EWJkDDGRdWJ8FAdQJmJRBTeN8iwUKCapkY6AxGLRy1cPhY+J9Kaoi2cCeV1DAABBgAZEQk1ElC26cAAAAASUVORK5CYII=";
				}else{
					changeCase = function(letter){ return letter.toLowerCase(); };
					imgSrc = "images/nuui-keyboard-capi0.png";
					//imgSrc = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABwAAAAcCAYAAAByDd+UAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAyZpVFh0WE1MOmNvbS5hZG9iZS54bXAAAAAAADw/eHBhY2tldCBiZWdpbj0i77u/IiBpZD0iVzVNME1wQ2VoaUh6cmVTek5UY3prYzlkIj8+IDx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9IkFkb2JlIFhNUCBDb3JlIDUuNS1jMDIxIDc5LjE1NTc3MiwgMjAxNC8wMS8xMy0xOTo0NDowMCAgICAgICAgIj4gPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4gPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6eG1wPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvIiB4bWxuczp4bXBNTT0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL21tLyIgeG1sbnM6c3RSZWY9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZVJlZiMiIHhtcDpDcmVhdG9yVG9vbD0iQWRvYmUgUGhvdG9zaG9wIENDIDIwMTQgKFdpbmRvd3MpIiB4bXBNTTpJbnN0YW5jZUlEPSJ4bXAuaWlkOjNBNDkzMjA3RkEwODExRTQ4OEU0OTA5QzcwREFGNUJFIiB4bXBNTTpEb2N1bWVudElEPSJ4bXAuZGlkOjNBNDkzMjA4RkEwODExRTQ4OEU0OTA5QzcwREFGNUJFIj4gPHhtcE1NOkRlcml2ZWRGcm9tIHN0UmVmOmluc3RhbmNlSUQ9InhtcC5paWQ6M0E0OTMyMDVGQTA4MTFFNDg4RTQ5MDlDNzBEQUY1QkUiIHN0UmVmOmRvY3VtZW50SUQ9InhtcC5kaWQ6M0E0OTMyMDZGQTA4MTFFNDg4RTQ5MDlDNzBEQUY1QkUiLz4gPC9yZGY6RGVzY3JpcHRpb24+IDwvcmRmOlJERj4gPC94OnhtcG1ldGE+IDw/eHBhY2tldCBlbmQ9InIiPz4OzkYWAAABgUlEQVR42mL08w9kIBGIAvFmKNsbiN+SopmJRMvYgHgFEJtD8SqoGE0sZATieUDshCTmBBVjpIWFbUAcjUU8GipHVQszgbgCif8MimGgAqqGKhZ6AfFkJP5HIPaA4o9I4pOhYhRZqAvEy4CYGcr/C8ThQHwZiqOgYgxQNSugesiyUAaItwExP5JYLhDvROJvg4rBAD9UTIZUC7Fp7ADi6VjUTofK4XMoXgtB+WodWtAsBeIqPKFRBVWDHBXrsOVRbBbOQMtr+4A4CYj/47HwP1TNPrQ8OpWQhaDknYjEByWMICD+RURq/gVVexlJLAUtO6FYiJ6Bn0CzxEcSCoePUD1PcBUYLHiKqLVAbIlm4D+oODIIxhJSIDX5aEXic1CQMwJrCy0g4xiuVIWjTEWPP2J9bwVyWTMJllECQHY0gyz8zEA/8BlkYQI0mHBhdRIMVCdgVgIxhfctEiwkqJaJgc5g1MKRZ+E/IsVwAhYyHPifHj78TyU1RFu4k0pqGAACDADFW0ujK5ksUAAAAABJRU5ErkJggg==";
				}

				// 变换字形
				_this._$skb.find('input.nu-skb-default').each(function(i, item){

					var letter = $(item).val();

					letter = changeCase(letter);

					$(item).val(letter);
				});

				// 改变图片
				$(this).find('img').attr('src', imgSrc);

			});

			$name_bind('del', function(){
				// 删除最后一个
				_this._spwd.pop();
				// 修改显示
				_this._displayVal = _this._displayVal.substring(0, (_this._displayVal.length - 1));
				_this._$input.text(_this._displayVal.length < 1 ? _this._config.placeholder : _this._displayVal);
				if(_this._displayVal.length < 1){
					_this._$input.height(_this._$input.height());
				}
			});

			$name_bind('确定', function(){
				_this.hide();
			});

			// 因为有了指定点击_$main才不退出, 所以不需要这个绑定
			//$name_bind('keyDown', function(){
			//	_this.hide();
			//});

			$name_bind('space', function(){
				if(!_this._config.codeMode){
					// 空格只有在非密码输入模式才有效
					_this._$input.text(_this._displayVal += ' ');
				}
			});

			$name_bind('abc', function(){
				_this._$main.empty().append(_this._$lettersContent);
				return false;
			});

			$name_bind('123', function(){
				_this._$main.empty().append(_this._$numbersContent);
				return false;
			});
		},

		_initKeyEvent: function(){
			var _this = this;

			this._$skb.on(this._touchEvent,'.nu-skb-default, .nu-skb-num-default', function(){

				var inputVal = $(this).attr('value');

				var value = _this._config.ct[inputVal];

				// 限制输入字数
				if(_this._displayVal.length >= _this._config.maxLength){return}

				if(_this._config.codeMode){
					// 密码模式
					_this._spwd.push(value);
					//console.log(_this._id, 'value = ', _this._spwd);
					// 展示
					if(_this._config.showLast){
						// 显示最后输入字符
						clearTimeout(_this._setTimeFunc);
						_this._$input.text(_this._displayVal + inputVal);
						_this._displayVal += _this._config.displayLetter;
						_this._setTimeFunc = setTimeout(function(){
							_this._$input.text(_this._displayVal);
						}, _this._config.displayTime);
					}else{
						_this._$input.text(_this._displayVal += _this._config.displayLetter);
					}
				} else {
					// 普通输入模式
					_this._$input.text(_this._displayVal += inputVal);
				}
			});
		},

		_calcCiphertext: function(){
			var o = {};
			var keys = this._config.key.split(",");
			var chars = this._constants._CHARS.substring(this._config.sequence) + this._constants._CHARS.substring(0, this._config.sequence);
			for(var i = 0 ; i < chars.length; i++){
				o[chars[i]] = keys[i];
			}
			this._config.ct = o;
		},

		//初始化父级DOM
		_initWrap: function(){
			this._$skb
				.append(
					"<div class=\"nu-skb-title\">" +
						"<span>" + this._config.title +"</span>" +
						"<span class='nu-skb-keyDown'>" +
							"<img src=\"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACIAAAANCAYAAADMvbwhAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAyZpVFh0WE1MOmNvbS5hZG9iZS54bXAAAAAAADw/eHBhY2tldCBiZWdpbj0i77u/IiBpZD0iVzVNME1wQ2VoaUh6cmVTek5UY3prYzlkIj8+IDx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9IkFkb2JlIFhNUCBDb3JlIDUuNS1jMDIxIDc5LjE1NTc3MiwgMjAxNC8wMS8xMy0xOTo0NDowMCAgICAgICAgIj4gPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4gPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6eG1wPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvIiB4bWxuczp4bXBNTT0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL21tLyIgeG1sbnM6c3RSZWY9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZVJlZiMiIHhtcDpDcmVhdG9yVG9vbD0iQWRvYmUgUGhvdG9zaG9wIENDIDIwMTQgKFdpbmRvd3MpIiB4bXBNTTpJbnN0YW5jZUlEPSJ4bXAuaWlkOkQ1MUE5RDAzMjA2MDExRTU4MkFDQUM3Mzk4N0YwMDA3IiB4bXBNTTpEb2N1bWVudElEPSJ4bXAuZGlkOkQ1MUE5RDA0MjA2MDExRTU4MkFDQUM3Mzk4N0YwMDA3Ij4gPHhtcE1NOkRlcml2ZWRGcm9tIHN0UmVmOmluc3RhbmNlSUQ9InhtcC5paWQ6RDUxQTlEMDEyMDYwMTFFNTgyQUNBQzczOTg3RjAwMDciIHN0UmVmOmRvY3VtZW50SUQ9InhtcC5kaWQ6RDUxQTlEMDIyMDYwMTFFNTgyQUNBQzczOTg3RjAwMDciLz4gPC9yZGY6RGVzY3JpcHRpb24+IDwvcmRmOlJERj4gPC94OnhtcG1ldGE+IDw/eHBhY2tldCBlbmQ9InIiPz5ivY9/AAABY0lEQVR42ryUwUoCURSGT1eX+Qb5AkYk5KY21hNM0jtILSJfwI2GLkvaJL7BLLSd62iTbQNDVy2itgaBYpD+B/4Lw6XUGc0D36B3zvnPmTv/nQ3f9w9F5AKcgzdZb2yBG1AzuJTAMehyoNgaBoixV5e9yzpIFbyCBLgGHbD3j0Oo9iN7Jdi7ooO0wY5uD/hxEjdXOIBqXVE7w1419m4bJn2BAtgHzyAe2DpvBUN41CpQW3sc8L/2FuMUPHFHimAEkuAOtGisKGZsUSNJzSJ3pBNMNL8Uf4NLkAYPXFNDvYQws2tGoVaa2mO3wMwQ64EsOAWffMeLmNk1o9aeUav3V5GZ82QTUAcpbq/MMLMd1JpRWKO1t9SSqIPYeAc5cMLfrpm9wHdI730wN8f8uWFCmq8JtkGDT2jNbM044b0UcxcOE+EkDEAeHIF+YL3PtTxzQkV8iW/DPdjlcRSehmFUsakAAwA9RlZanXg0sAAAAABJRU5ErkJggg==\" >" +
						"</span>" +
					"</div>"
				)
				.append(
					this._$main = $('<div class="nu-skb-container">')
				)
				.appendTo(this._$doc);
		},

		// 乱序方法
		_shuffle: function (inputArr) {
			var valArr = [], k;

			for (k in inputArr) { // Get key and value arrays
				if (inputArr.hasOwnProperty(k)) {
					valArr.push(inputArr[k]);
				}
			}
			valArr.sort(function () {
				return 0.5 - Math.random();
			});

			return valArr;
		},

		_createNumKey: function(){
			this._$numbersContent = $('<div>');

			var numberAry = this._constants._nums.slice();

			if(this._config.randomKeys){numberAry = this._shuffle(numberAry)}

			var key1, key2 = 'del';
			if(this._config.keyboardMode < 3){
				key1 = 'abc';
			} else if(this._config.keyboardMode == 3){
				key1 = '.';
			} else if(this._config.keyboardMode == 4){
				key1 = 'del';
				key2 = '确定';
			}
			numberAry.splice(9, 0, key1);
			numberAry.push(key2);

			// 分三行
			var cols = 3;

			for(var e = 0; e < numberAry.length; e++){

				var $row;

				if(e % cols == 0){
					// 新建一行
					$row = $('<div class="nu-skb-row">');
				}

				var $wrap = $('<span>').addClass('nu-skb-col-num');

				var content, $node, className;

				var modeLetter = this._constants._modeLetter[numberAry[e]];

				// 内容
				if(modeLetter){
					// nu-skb-mod按钮
					$node = modeLetter.content ? $("<div>").append(modeLetter.content) : $("<input type='button'>").attr('value', numberAry[e]);

					className = 'nu-skb-btn nu-skb-mod';

					className += " " + modeLetter.class;

				} else {
					// 普通按钮
					$node = $("<input type='button'>").attr('value', numberAry[e]);

					className = 'nu-skb-btn nu-skb-num-default';

					//className += " " + 'nu-skb-num-' + numberAry[e];
				}

				content = $node.attr({'class': className});

				$wrap.append(content).appendTo($row);

				// 数量满一行或最后一个就渲染到容器里
				if($row.children().length == cols || e == numberAry.length - 1){
					this._$numbersContent.append($row);
				}
			}

		},

		_createLetterKey: function(){

			this._$lettersContent = $('<div>');

			for(var line = 0; line < this._constants._letterline.length; line++ ){

				var lineKey = this._constants._letterline[line];

				var $row = $('<div class="nu-skb-row">');

				for(var e = 0; e < lineKey.length; e++){
					var $wrap = $('<span>').addClass('nu-skb-col');

					var content;

					var modeLetter = this._constants._modeLetter[lineKey[e]];

					var $node, className;

					// 内容
					if(modeLetter){
						// nu-skb-mod按钮
						$node = modeLetter.content ? $("<div>").append(modeLetter.content) : $("<input type='button'>").attr('value', lineKey[e]);

						className = 'nu-skb-btn nu-skb-mod';

						className += " " + modeLetter.class;

					} else {
						// nu-skb-default普通按钮
						$node = $("<input type='button'>").attr('value', lineKey[e]);

						className = 'nu-skb-btn ' + ((lineKey[e].length < 1) ? 'nu-skb-space' : 'nu-skb-default');

						//className += " " + (lineKey[e].length < 1)?'nu-skb-space':('nu-skb-' + lineKey[e]);
					}

					content = $node.attr({'class': className});

					$wrap.append(content).appendTo($row);
				}
				this._$lettersContent.append($row);
			}

		},

		/*
		* 隐藏键盘
		* */
		hide:function(){
			this._$skb.css({'bottom': '-' + this._$skb.height() + 'px'});
		},

		/*
		* 获取密码键盘的ID
		* */
		getId:function(){
			return this._id;
		},

		/*
		* 获取报文的长度
		* */
		getLength:function(){
			return this._spwd.length;
		},

		/*
		 * 获取报文
		 * */
		getEncrypt: function(){
			return this._spwd.join(this._config.joinLetter);
		}
	}

});