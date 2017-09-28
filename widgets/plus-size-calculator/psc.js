(function () {
	/**
	 * PlusSizeCalculator: Render the Plus Size Calculator widget within a container element
	 * @constructor
	 * @param {number} containerId - The id of the widget's parent element
	 * @param {Object} options - Optional arguments
	 */
	function PlusSizeCalculator(containerId, options) {
		var self = this;

		if (typeof options !== 'object') {
			options = {};
		}

		// Dev or production
		this.dev = options.dev ? options.dev : false;

		// Id of our widget's parent element
		this.containerId = containerId;

		// Paths to our stylesheet and template
		this.cdnUrl = this.dev ? '' : 'https://gitcdn.xyz/repo/Burkson/com.burkson.ridestyler.widgets/master/widgets/plus-size-calculator/';
		this.cssUri = this.cdnUrl + 'styles/psc.css';
		this.tplUri = this.cdnUrl + 'templates/psc.tpl';

		// Increment the Tire Speed Difference data by this value per row
		this.mphIncrement = options.mphIncrement ? options.mphIncrement : 10;

		// Metric and flotation tire measurements
		this.measurements = [];
		this.flotMeasurements = [];

		// Indicates whether each measurement form is filled
		this.tmEntered = false;
		this.ctmEntered = false;

		// If our stylesheet and template have been injected
		this.stylesheetLoaded = false;
		this.templateLoaded = false;

		// Width thresholds for adjusting layout
		this.smallWidth = 840;
		this.smallestWidth = 480;

		// The widget container element
		this.element = document.getElementById(this.containerId);

		// The widget wrapper element, used in resizing
		this.wrap = null;

		// If we don't have a container element loaded, wait for DOMContent loaded to fire
		if (!this.element) {
			this.addListener(document, 'DOMContentLoaded', function(event) {
				self.element = document.getElementById(self.containerId);
				self.afterDomReady();
			});
		} else {
			self.afterDomReady();
		}
	}

	/**
	 * When the DOM is ready, show a loading message and inject our stylesheet and template
	 */
	PlusSizeCalculator.prototype.afterDomReady = function() {
		this.showLoading(true);

		if (this.element == null) {
			console.error('Invalid container Id');
			return;
		}

		// Initialize after both stylesheet and template have loaded
		this.insertStyles(this.initialize);
		this.loadTemplate(this.initialize);
	};

	/**
	 * Get tire sizes from ridestyler and initialize the measurement selects
	 * Also set up event handlers for user actions
	 */
	PlusSizeCalculator.prototype.initialize = function() {
		var self = this;

		if (!this.templateLoaded && !this.stylesheetLoaded) {
			return;
		} else {
			this.showLoading(false);
		}

		ridestyler.ajax.send({
			action: "Tire/GetValidTireSizeDescriptions",
			data: {
				SizeType: 'Metric'
			},
			callback: function (res) {
				if (res.Success) {
					var md = self.getMetricMeasurements(res.Sizes),
					len = 0,
					firstData = [],
					firstEls = [];

					self.measurements = md;

					if (md.first.length) {
						firstData = md.first;
						firstEls = document.getElementsByClassName('psc-firsti');

						len = firstEls.length;
						for (var i = 0; i < len; i++) {
							initSelect(firstEls[i], 'Width', firstData);
						}
					}

					disableByClass('psc-secondi');
					disableByClass('psc-thirdi');
				} else {
					console.error('Failed to retrieve tire sizes');
				}
			}
		});

		// Adjust styles on resize
		this.addListener(window, 'resize', this.adjustLayout);
		this.adjustLayout();

		// First menu change
		var firsti = document.getElementsByClassName('psc-firsti');
		this.addListeners(firsti, 'change', this.onFirstChange);

		// Second menu change
		var secondi = document.getElementsByClassName('psc-secondi');
		this.addListeners(secondi, 'change', this.onSecondChange);

		// Third menu change
		var thirdi = document.getElementsByClassName('psc-thirdi');
		this.addListeners(thirdi, 'change', this.onThirdChange);

		// Size type change
		var sizeType = document.getElementsByClassName('psc-sizetype');
		this.addListeners(sizeType, 'change', this.onSizeTypeChange);

		// Form submit / display specs/diffs
		var submit = document.getElementById('psc-form-submit');
		this.addListeners(submit, 'click', this.onSubmit);
	};

	/**
	 * A first menu has changed, clear second and third menus and repopulate second
	 */
	PlusSizeCalculator.prototype.onFirstChange = function(e) {
		var first = e.target,
		secondVals = [],
		fVal = first.value,
		parent = first.parentElement.parentElement,
		second = first.parentElement.nextElementSibling,
		third = second.nextElementSibling;

		emptyDisableElem(second.children[0]);
		emptyDisableElem(third.children[0]);

		this.checkFormAfterChange();

		if (fVal != '') {
			secondVals = hasClass(parent, "flotation") ? this.flotMeasurements.second[fVal] : this.measurements.second[fVal];
			if (secondVals && secondVals.length) {
				var secondLabel = hasClass(parent, "flotation") ? 'Width' : 'Aspect Ratio';
				initSelect(second.children[0], secondLabel, secondVals);
			}
		}
	};

	/**
	 * A second menu has changed, clear the third menu and repopulate it
	 */
	PlusSizeCalculator.prototype.onSecondChange = function(e) {
		var second = e.target,
		thirdVals = [],
		sVal = second.value,
		parent = second.parentElement.parentElement,
		first = second.parentElement.previousElementSibling,
		third = second.parentElement.nextElementSibling,
		fVal = first.children[0].value;

		emptyDisableElem(third.children[0]);

		this.checkFormAfterChange();

		if (fVal != '' && sVal != '') {
			thirdVals = hasClass(parent, "flotation") ? this.flotMeasurements.third[fVal + "_" + sVal] : this.measurements.third[fVal + "_" + sVal];
			if (thirdVals.length) {
				initSelect(third.children[0], 'Inner Diameter', thirdVals);
			}
		}
	};

	/**
	 * A third menu has changed, clear spec values and submit our form
	 */
	PlusSizeCalculator.prototype.onThirdChange = function() {
		this.checkFormAfterChange();
		document.getElementById("psc-form-submit").click();
	};

	/**
	 * Change to/from metic/flotation
	 * Clear our menus and repopulate the firsts
	 */
	PlusSizeCalculator.prototype.onSizeTypeChange = function(e) {
		var self = this,
		sizetype = e.target,
		groups = document.getElementsByClassName('psc-input-select-group'),
		selects = document.getElementsByClassName('psc-select'),
		firstSelects = document.getElementsByClassName('psc-firsti'),
		len = selects.length,
		stVal = sizetype.value;

		for (var i = 0; i < len; i++) {
			emptyDisableElem(selects[i]);
		}

		clearValsByClass('psc-value');

		if (stVal == 'flotation') {
			if (this.flotMeasurements.length) {
				if (this.flotMeasurements.first.length) {
					var outerDiam = this.flotMeasurements.first;

					len = firstSelects.length;
					for (i = 0; i < len; i++) {
						initSelect(firstSelects[i], 'Outer Diameter', outerDiam);
					}

					len = groups.length;
					for (i = 0; i < len; i++) {
						addClass(groups[i], "flotation");
					}
				}
			} else {
				ridestyler.ajax.send({
					action: "Tire/GetValidTireSizeDescriptions",
					data: {
						SizeType: 'Flotation'
					},
					callback: function (res) {
						if (res.Success) {
							var sizes = res.Sizes;

							self.flotMeasurements = self.getFlotationMeasurements(sizes);
							if (self.flotMeasurements.first.length) {
								var outerDiam = self.flotMeasurements.first,
								len = firstSelects.length;

								for (var i = 0; i < len; i++) {
									initSelect(firstSelects[i], 'Outer Diameter', outerDiam);
								}

								len = groups.length;
								for (i = 0; i < len; i++) {
									addClass(groups[i], "flotation");
								}
							}
						} else {
							console.error('RS request failed');
						}
					}
				});
			}
		} else if (this.measurements.first.length) {
			var firstData = this.measurements.first;

			len = groups.length;
			for (i = 0; i < len; i++) {
				removeClass(groups[i], "flotation");
			}

			len = firstSelects.length;
			for (i = 0; i < len; i++) {
				initSelect(firstSelects[i], 'Width', firstData);
			}
		}
	};

	/**
	 * One or more of our measurement sections are complete
	 * Make an API call to compare sizes and display the info
	 * @return {boolean} - false to suppress form submission
	 */
	PlusSizeCalculator.prototype.onSubmit = function(e) {
		e.preventDefault();
		if (!this.tmEntered) {
			return false;
		}

		var self = this,
		selects = document.getElementsByClassName('psc-select'),
		groups = document.getElementsByClassName('psc-input-select-group'),
		sep1 = hasClass(groups[0], 'flotation') ? 'x' : '/',
		sep2 = hasClass(groups[1], 'flotation') ? 'x' : '/',
		tmSize = selects[0].value + sep1 + selects[1].value + "R" + selects[2].value,
		compareSize = tmSize,
		params = {};

		if (this.ctmEntered) {
			compareSize = selects[3].value + sep2 + selects[4].value + "R" + selects[5].value;
		}

		params = {
			BaseSize: tmSize,
			"NewSizes[0]": compareSize
		};

		ridestyler.ajax.send({
			action: "Tire/CompareSizes",
			data: params,
			callback: function (res) {
				if (res.Success) {
					self.populateComparison(res); 
				} else {
					console.error('RS request failed');
				}
			}
		});

		return false;
	};

	/**
	 * Set class(es) on widget wrapper based on container dimensions
	 */
	PlusSizeCalculator.prototype.adjustLayout = function() {
		if (!this.element) return;

		var cWidth = this.element.offsetWidth;
		if (!this.wrap) {
			this.wrap = this.element.getElementsByClassName('psc-widget')[0];
		}

		if (this.wrap) {
			if (cWidth <= this.smallestWidth) {
				if (!hasClass(this.wrap, 'psc-small')) {
					addClass(this.wrap, 'psc-small');
				}
				if (!hasClass(this.wrap, 'psc-smallest')) {
					addClass(this.wrap, 'psc-smallest');
				}
			} else if (cWidth <= this.smallWidth) {
				if (!hasClass(this.wrap, 'psc-small')) {
					addClass(this.wrap, 'psc-small');
				}
				removeClass(this.wrap, 'psc-smallest');
			} else {
				removeClass(this.wrap, ['psc-small', 'psc-smallest']);
			}
		}
	};

	/**
	 * After a form change, check whether each measurement form is filled out
	 * Set an internal indicator if so
	 */
	PlusSizeCalculator.prototype.checkFormAfterChange = function() {
		var self = this,
		groups = document.getElementsByClassName('psc-input-select-group'),
		baseGroup = groups[0].getElementsByClassName("psc-select"),
		compGroup = groups[1].getElementsByClassName("psc-select"),
		baseVals = [],
		compVals = [],
		len = baseGroup.length,
		val = null,
		clearClass = '';

		for (var i = 0; i < len; i++) {
			val = baseGroup[i].value;
			if (!val || val.trim() == '') {
				baseVals.push(baseGroup[i]);
				self.tmEntered = false;
			}
		}

		len = compGroup.length;
		for (i = 0; i < len; i++) {
			val = compGroup[i].value;
			if (!val || val.trim() == '') {
				compVals.push(compGroup[i]);
				self.ctmEntered = false;
			}
		}

		if (!baseVals.length) {
			self.tmEntered = true;
		}

		if (!compVals.length) {
			self.ctmEntered = true;
		}

		// If the first section measurements are complete (tmEntered=true), clear the tire2 vals
		// Otherwise, clear all vals
		clearClass = this.tmEntered ? 'psc-tire2' : 'psc-value';
		clearValsByClass(clearClass);
	};

	/**
	 * Separate metric GetValidTireSizeDescriptions response data into arrays for each menu
	 * @param {Array} tireSizes - Raw metric data on tire sizes
	 * @return {Object} - Measurements in the form {first:[], second:[], third:[]}
	 */
	PlusSizeCalculator.prototype.getMetricMeasurements = function(tireSizes) {
		var res = {},
		width = [],
		aspect = [],
		inDiam = [],
		len = tireSizes.length,
		tSize = null;

		for (var i = 0; i < len; i++) {
			tSize = tireSizes[i];
			if (width.indexOf(tSize.Width) === -1) {
				width.push(tSize.Width);
				aspect[tSize.Width] = [];
				aspect[tSize.Width].push(tSize.AspectRatio);
				inDiam[tSize.Width + "_" + tSize.AspectRatio] = [];
				inDiam[tSize.Width + "_" + tSize.AspectRatio].push(tSize.InsideDiameter);
			} else {
				if (aspect[tSize.Width].indexOf(tSize.AspectRatio) === -1) {
					aspect[tSize.Width].push(tSize.AspectRatio);
					inDiam[tSize.Width + "_" + tSize.AspectRatio] = [];
					inDiam[tSize.Width + "_" + tSize.AspectRatio].push(tSize.InsideDiameter);
				} else {
					if (inDiam[tSize.Width + "_" + tSize.AspectRatio].indexOf(tSize.InsideDiameter) === -1) {
						inDiam[tSize.Width + "_" + tSize.AspectRatio].push(tSize.InsideDiameter);
					} 
				}
			}
		}

		res.first = width;
		res.second = aspect;
		res.third = inDiam;

		return res;
	};

	/**
	 * Separate flotation GetValidTireSizeDescriptions response data into arrays for each menu
	 * @param {Array} tireSizes - Raw flotation data on tire sizes
	 * @return {Object} - Measurements in the form {first:[], second:[], third:[]}
	 */
	PlusSizeCalculator.prototype.getFlotationMeasurements = function(tireSizes) {
		var res = {},
		outDiam = [],
		width = [],
		inDiam = [],
		len = tireSizes.length,
		tSize = null;

		for (var i = 0; i < len; i++) {
			tSize = tireSizes[i];

			if (outDiam.indexOf(tSize.OutsideDiameter) === -1) {
				outDiam.push(tSize.OutsideDiameter);
				width[tSize.OutsideDiameter] = [];
				width[tSize.OutsideDiameter].push(tSize.Width);
				inDiam[tSize.OutsideDiameter + "_" + tSize.Width] = [];
				inDiam[tSize.OutsideDiameter + "_" + tSize.Width].push(tSize.InsideDiameter);
			} else {
				if (width.indexOf(tSize.Width) === -1) {
					width[tSize.OutsideDiameter] = [];
					width[tSize.OutsideDiameter].push(tSize.Width);
					inDiam[tSize.OutsideDiameter + "_" + tSize.Width] = [];
					inDiam[tSize.OutsideDiameter + "_" + tSize.Width].push(tSize.InsideDiameter);
				} else {
					if (inDiam[tSize.OutsideDiameter + "_" + tSize.Width].indexOf(tSize.InsideDiameter) === -1) {
						inDiam[tSize.OutsideDiameter + "_" + tSize.Width].push(tSize.InsideDiameter);
					}
				}
			}
		}

		res.first = outDiam;
		res.second = width;
		res.third = inDiam;

		return res;
	};

	/**
	 * Populates the tire specification / difference sections
	 * @param {Object} compData - Data from ridestyler comparing two tire sizes
	 */
	PlusSizeCalculator.prototype.populateComparison = function(compData) {
		var baseSize = compData.BaseSize,
		newSizes = compData.NewSizes[0],
		diffs = compData.Differences[0],
		tsdBody = document.getElementById('psc-tsd-table').getElementsByTagName('tbody'),
		trs = tsdBody[0].getElementsByTagName('tr'),
		len = trs.length,
		increment = this.mphIncrement,
		rowVals = null,
		rows = {
			OutsideDiameter: document.getElementById('psc-diameter-row').getElementsByClassName('psc-value'), 
			Width: document.getElementById('psc-width-row').getElementsByClassName('psc-value'), 
			SidewallHeight: document.getElementById('psc-sidewall-row').getElementsByClassName('psc-value'), 
			OutsideCircumference: document.getElementById('psc-circumference-row').getElementsByClassName('psc-value'), 
			Revolutions: document.getElementById('psc-revsmile-row').getElementsByClassName('psc-value')
		};

		for (var i in rows) {
			if (i === 'Revolutions') {
				rows[i][0].innerHTML = baseSize[i].PerMile.toFixed(2);
				rows[i][1].innerHTML = newSizes[i].PerMile.toFixed(2);
			} else {
				rows[i][0].innerHTML = baseSize[i].Inches.toFixed(2);
				rows[i][1].innerHTML = newSizes[i].Inches.toFixed(2);
			}
			rows[i][2].innerHTML = (100 * diffs[i].Percent).toFixed(2) + '%';
		}

		for (i = 0; i < len; i++) {
			rowVals = trs[i].getElementsByClassName('psc-value');
			rowVals[0].innerHTML = increment;
			rowVals[1].innerHTML = ((diffs.OutsideCircumference.Percent + 1) * increment).toFixed(2);
			increment += this.mphIncrement;
		}

		if (!this.ctmEntered) {
			this.clearSecond();
		}
	};

	/**
	 * Load our html template via xhr
	 * @param {function} cb
	 */
	PlusSizeCalculator.prototype.loadTemplate = function(cb) {
		var self = this,
		xhr = new XMLHttpRequest();

		xhr.onreadystatechange = function() {
			var completed = 4;
			if (xhr.readyState === completed) {
				if (xhr.status === 200) {
					self.element.innerHTML = xhr.responseText;
					self.templateLoaded = true;
					cb.apply(self);
				} else {
					console.error('xhr request for template failed');
				}
			}
		};

		xhr.open('GET', this.tplUri, true);
		xhr.send(null);
	};

	/**
	 * Insert our stylesheet into the <head>
	 * @param {function} cb
	 */
	PlusSizeCalculator.prototype.insertStyles = function(cb) {
		var self = this,
		css = document.createElement('link');

		css.rel = 'stylesheet';
		css.type = 'text/css';
		css.href = this.cssUri;
		css.onload = function() {
			if (!self.stylesheetLoaded) {
				self.stylesheetLoaded = true;
				cb.apply(self);
			}
		};

		prependChild(document.getElementsByTagName('head')[0], css);
	};

	/**
	 * Display or remove a loading indicator 
	 * @param {boolean} isLoading
	 */
	PlusSizeCalculator.prototype.showLoading = function(isLoading) {
		var loadingIndicator = document.getElementById('psc-loading');

		if (this.templateLoaded && this.stylesheetLoaded) {
			isLoading = false;
		}

		if (isLoading) {
			if (loadingIndicator == null) {
				var elem = document.createElement('div');
				elem.id = 'psc-loading';
				elem.innerHTML = 'Loading...';
				elem.style = {
					'font-family': '"proxima-nova-alt-ext-cond", sans-serif',
					'color': '#555'
				};
				this.element.appendChild(elem);
			}
		} else {
			if (loadingIndicator) {
				loadingIndicator.outerHTML = '';
			}
		}
	};

	/**
	 * Clear the non .psc-tire1 fields
	 */
	PlusSizeCalculator.prototype.clearSecond = function() {
		var secondVals = document.getElementsByClassName('psc-value'),
		len = secondVals.length;

		for (var i = 0; i < len; i++) {
			if (!hasClass(secondVals[i], 'psc-tire1')) {
				secondVals[i].innerHTML = '';
			}
		}
	};

	/**
	 * Add an event listener of type eventType for one or more elements
	 * @param {Array} els - Array of elements on which to attach listeners
	 * @param {string} eventType - The event type we are listening for
	 * @param {function} cb - Callback to execute when the event fires
	 */
	PlusSizeCalculator.prototype.addListeners = function(els, eventType, cb) {
		if (els) {
			if (typeof els.length !== 'undefined') {
				for (var i = 0; i < els.length; i++) {
					this.addListener(els[i], eventType, cb);
				}
			} else {
				this.addListener(els, eventType, cb);
			}
		}
	};

	/**
	 * Add an event listener of type eventType for a single element
	 * @param {Element} el
	 * @param {string} eventType
	 * @param {function} cb 
	 */
	PlusSizeCalculator.prototype.addListener = function(el, eventType, cb) {
		if (el) {
			if (el.addEventListener) {
				el.addEventListener(eventType, proxy(cb, this));
			} else if (el.attachEvent) {
				el.attachEvent('on' + eventType, proxy(cb, this));
			} else {
				console.error('Unable to attach ' + eventType + ' event listener');
			}
		}
	};

	/**
	 * Disable a class of elements
	 * @param {string} className - className of elements to disable
	 */
	var disableByClass = function(className) {
		var elems = document.getElementsByClassName(className),
		len = elems.length;

		for (var i = 0; i < len; i++) {
			elems[i].disabled = 'disabled';
		}	
	};

	/**
	 * Empty and disable an element
	 * @param {Element} elem
	 */
	var emptyDisableElem = function(elem) {
		elem.innerHTML = ''; 
		elem.disabled = 'disabled';
	};

	/**
	 * Initialize a measurement select
	 * Empty the select, sort the data to populate it, and create <options> for the data
	 * @param {Element} elem - The select Element to initialize
	 * @param {string} label - Label for the first option
	 * @param {Array} data - Data to populate the select
	 */
	var initSelect = function(elem, label, data) {
		var opt = null,
		len = data.length;

		elem.innerHTML = '';

		data.sort(function(one, two) {
			return one - two;
		});

		opt = document.createElement('option');
		opt.innerText = label;
		opt.value = '';

		elem.appendChild(opt);
		elem.disabled = false;

		for (var i = 0; i < len; i++) {
			opt = document.createElement('option');
			opt.innerText = data[i];
			elem.appendChild(opt);
		}
	};

	/**
	 * Clear a class of elements
	 * @param {string} className
	 */
	var clearValsByClass = function (className) {
		var elems = document.getElementsByClassName(className),
		len = elems.length;

		for (var i = 0; i < len; i++) {
			elems[i].innerText = '';
			elems[i].innerHTML = '';
		}
	};

	/**
	 * Determines if element el has class cl
	 * @param {Element} el
	 * @param {string} cl
	 * @return {boolean}
	 */
	var hasClass = function (el, cl) {
		var regex = new RegExp('(?:\\s|^)' + cl + '(?:\\s|$)');
		return !!el.className.match(regex);
	};

	/**
	 * Add class cl to element el
	 * @param {Element} el
	 * @param {string} cl
	 */
	var addClass = function (el, cl) {
		if (el.className.indexOf(cl) === -1) {
			el.className += ' ' + cl;
			el.className = el.className.trim();
		}
	};

	/**
	 * Remove class(es) from element el
	 * @param {Element} el
	 * @param {string|Array} cl
	 */
	var removeClass = function (el, cl) {
		var regex = null,
		len = 0;

		if (typeof cl !== 'object') {
			cl = [cl];
		}

		len = cl.length;
		for (var i = 0; i < len; i++) {
			regex = new RegExp('(?:\\s|^)' + cl[i] + '(?:\\s|$)');
			el.className = el.className.replace(regex, ' ');
		}
    };

	/**
	 * Call function cbwith context ctx
	 * @param {function} cb
	 * @param {Object} ctx
	 * @return {function}
	 */
	var proxy = function(cb, ctx) {
		return function() {
			return cb.apply(ctx, arguments);
		};
	};

	/**
	 * Prepend node newChild to a parent element
	 * @param {Element} parent
	 * @param {Element} newChild
	 */
	function prependChild(parent, newChild) {
		parent.insertBefore(newChild, parent.firstChild);
	}

	window.PlusSizeCalculator = PlusSizeCalculator;
})();