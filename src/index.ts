import Scroller from './Scroller';

const MIN_INDICATOR_SIZE = 8;
let win: any = typeof window !== 'undefined' ? window : undefined;

if (!win) {
  win = typeof global !== 'undefined' ? global : {};
}

const isTouch = 'ontouchstart' in win;

function setTransform(nodeStyle, value) {
  nodeStyle.transform = value;
  nodeStyle.webkitTransform = value;
  nodeStyle.MozTransform = value;
}

let supportsPassive = false;
try {
  const opts = Object.defineProperty({}, 'passive', {
    get() {
      supportsPassive = true;
    },
  });
  win.addEventListener('test', null, opts);
} catch (e) {
  // empty
}

function preventDefault(e) {
  if (!supportsPassive) {
    preventDefault(e);
  }
}

const isWebView =
  typeof navigator !== 'undefined' &&
  /(iPhone|iPod|iPad).*AppleWebKit(?!.*Safari)/i.test(navigator.userAgent);

function iOSWebViewFix(e, touchendFn) {
  // https://github.com/ant-design/ant-design-mobile/issues/573#issuecomment-339560829
  // iOS UIWebView issue, It seems no problem in WKWebView
  if (isWebView && e.changedTouches[0].clientY < 0) {
    touchendFn(new Event('touchend') || e);
  }
}

const willNotPreventDefault = supportsPassive ? { passive: true } : false;

function addEventListener(target, type, fn, _options = willNotPreventDefault) {
  target.addEventListener(type, fn, _options);
  return () => {
    target.removeEventListener(type, fn, _options);
  };
}

function deltaX(event) {
  return 'deltaX' in event
    ? event.deltaX
    : // Fallback to `wheelDeltaX` for Webkit and normalize (right is positive).
    'wheelDeltaX' in event
    ? -event.wheelDeltaX
    : 0;
}

function deltaY(event) {
  return 'deltaY' in event
    ? event.deltaY
    : // Fallback to `wheelDeltaY` for Webkit and normalize (down is positive).
    'wheelDeltaY' in event
    ? -event.wheelDeltaY
    : // Fallback to `wheelDelta` for IE<9 and normalize (down is positive).
    'wheelDelta' in event
    ? -event.wheelDelta
    : 0;
}

interface ViewportSize {
  width: number;
  height: number;
}

interface ContentSize {
  width: number;
  height: number;
}

interface XY {
  width?: number;
  height?: number;
  scrollbar?: {
    style?: any;
    className?: string;
  };
  indicator?: {
    style?: any;
    className?: string;
  };
}

type X = XY & { width: number };

type Y = XY & { height: number };

interface ZScrollerOption {
  locking?: boolean;
  viewport: ViewportSize;
  content: ContentSize;
  x?: X;
  y?: Y;
  container?: HTMLElement;
  scrollingComplete?: () => any;
  onScroll?: (left: number, top: number, zoom: number) => any;
}

class ZScroller {
  private _ratio: { x?: number; y?: number };
  private _containerMouseDownTimer: any;
  private _options: ZScrollerOption;
  private _zOptions: any;
  private _destroyed: boolean;
  private _timer: any;
  private _scrollbars: any;
  private _indicators: any;
  private _indicatorsSize: any;
  private _indicatorsPos: any;
  private _scrollbarsOpacity: any;
  private _scroller: any;
  private _disabled: boolean;
  private _eventHandlers: any[];
  private __onIndicatorStartMouseMoving: boolean;
  private _initPagePos: {
    pageX: number;
    pageY: number;
    left: number;
    top: number;
  };
  constructor(_options: ZScrollerOption) {
    const {
      container,
      viewport,
      content,
      onScroll,
      x,
      y,
      ...zOptions
    } = _options;
    let scrollbars;
    let indicators;
    let indicatorsSize;
    let indicatorsPos;
    let scrollbarsOpacity;

    this._options = _options;

    this._zOptions = {
      ...zOptions,
      scrollingX: !!x,
      scrollingY: !!y,
      scrollingComplete: () => {
        this._clearScrollbarTimer();
        this._timer = setTimeout(() => {
          if (this._destroyed) {
            return;
          }
          if (_options.scrollingComplete) {
            _options.scrollingComplete();
          }
          if (scrollbars && isTouch) {
            ['x', 'y'].forEach(k => {
              if (scrollbars[k]) {
                this._setScrollbarOpacity(k, 0);
              }
            });
          }
        }, 0);
      },
    };

    scrollbars = this._scrollbars = {};
    indicators = this._indicators = {};
    indicatorsSize = this._indicatorsSize = {};
    indicatorsPos = this._indicatorsPos = {};
    scrollbarsOpacity = this._scrollbarsOpacity = {};

    ['x', 'y'].forEach(k => {
      const optionName = k === 'x' ? 'scrollingX' : 'scrollingY';
      const scrollerStyle = k === 'x' ? x : y;
      if (this._options[optionName] !== false) {
        scrollbars[k] = document.createElement('div');
        scrollbars[k].className = `zscroller-scrollbar-${k}`;
        if (scrollerStyle.scrollbar) {
          if (scrollerStyle.scrollbar.style) {
            Object.assign(scrollbars[k].style, scrollerStyle.scrollbar.style);
          }
          if (scrollerStyle.scrollbar.className) {
            scrollbars[k].className += ' ' + scrollerStyle.scrollbar.className;
          }
        }
        if (scrollerStyle.width) {
          scrollbars[k].style.width = scrollerStyle.width + 'px';
        }
        if (scrollerStyle.height) {
          scrollbars[k].style.height = scrollerStyle.height + 'px';
        }
        indicators[k] = document.createElement('div');
        indicators[k].className = `zscroller-indicator-${k}`;
        if (scrollerStyle.indicator) {
          if (scrollerStyle.indicator.style) {
            Object.assign(indicators[k].style, scrollerStyle.indicator.style);
          }
          if (scrollerStyle.indicator.className) {
            indicators[k].className += ' ' + scrollerStyle.indicator.className;
          }
        }
        scrollbars[k].appendChild(indicators[k]);
        indicatorsSize[k] = -1;
        scrollbarsOpacity[k] = 0;
        indicatorsPos[k] = 0;
      }
    });

    // create Scroller instance
    this._scroller = new Scroller((left, top, zoom) => {
      if (_options.onScroll) {
        _options.onScroll(left, top, zoom);
      }
      this._adjustScrollBar();
    }, this._zOptions);

    this._eventHandlers = [];

    this.setDimensions();

    // bind events
    this._bindEvents();

    if (isTouch) {
      this._setScrollbarOpacity('x', 0);
      this._setScrollbarOpacity('y', 0);
    }
  }

  _adjustScrollBar() {
    const _options = this._options;
    const scrollbars = this._scrollbars;
    const { x, y } = this._options;
    if (scrollbars) {
      ['x', 'y'].forEach(k => {
        if (scrollbars[k]) {
          const pos =
            k === 'x'
              ? this._scroller.__scrollLeft
              : this._scroller.__scrollTop;
          const scrollerSize = k === 'x' ? x.width : y.height;
          const viewportSize =
            k === 'x' ? _options.viewport.width : _options.viewport.height;
          const contentSize =
            k === 'x' ? _options.content.width : _options.content.height;
          if (viewportSize >= contentSize) {
            this._setScrollbarOpacity(k, 0);
          } else {
            this._setScrollbarOpacity(k, 1);
            const normalIndicatorSize =
              (viewportSize / contentSize) * scrollerSize;
            let size = normalIndicatorSize;
            let indicatorPos;
            if (pos < 0) {
              size = Math.max(normalIndicatorSize + pos, MIN_INDICATOR_SIZE);
              indicatorPos = 0;
            } else if (pos > contentSize - viewportSize) {
              size = Math.max(
                normalIndicatorSize + contentSize - viewportSize - pos,
                MIN_INDICATOR_SIZE,
              );
              indicatorPos = scrollerSize - size;
            } else {
              indicatorPos = (pos / contentSize) * scrollerSize;
            }
            this._setIndicatorSize(k, size);
            this._setIndicatorPos(k, indicatorPos);
          }
        }
      });
    }
  }

  getScrollbar(type): HTMLElement {
    return this._scrollbars[type];
  }

  setDisabled(disabled) {
    this._disabled = disabled;
  }

  _clearScrollbarTimer() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }
  _setScrollbarOpacity(axis, opacity) {
    if (this._scrollbarsOpacity[axis] !== opacity) {
      this._scrollbars[axis].style.opacity = opacity;
      this._scrollbarsOpacity[axis] = opacity;
    }
  }
  _setIndicatorPos(axis, value) {
    const { _indicatorsPos, _indicators } = this;
    if (_indicatorsPos[axis] !== value) {
      if (axis === 'x') {
        setTransform(_indicators[axis].style, `translate3d(${value}px,0,0)`);
      } else {
        setTransform(_indicators[axis].style, `translate3d(0, ${value}px,0)`);
      }
      _indicatorsPos[axis] = value;
    }
  }
  _setIndicatorSize(axis, value) {
    const { _indicatorsSize, _indicators } = this;
    if (_indicatorsSize[axis] !== value) {
      _indicators[axis].style[axis === 'x' ? 'width' : 'height'] = `${value}px`;
      _indicatorsSize[axis] = value;
    }
  }
  setDimensions({
    viewport,
    content,
    x,
    y,
  }: {
    viewport?: ViewportSize;
    content?: ContentSize;
    x?: X;
    y?: Y;
  } = {}) {
    const { _options, _scroller: scroller } = this;
    Object.assign(_options.x, x);
    Object.assign(_options.y, y);
    Object.assign(_options.content, content);
    Object.assign(_options.viewport, viewport);
    // set the right scroller dimensions
    scroller.setDimensions(
      _options.viewport.width,
      _options.viewport.height,
      _options.content.width,
      _options.content.height,
    );
    this._ratio = {};
    if (_options.x && _options.x.width) {
      this._ratio.x = _options.content.width / _options.x.width;
    }
    if (_options.y && _options.y.height) {
      this._ratio.y = _options.content.height / _options.y.height;
    }
  }
  destroy() {
    this._destroyed = true;
    this._unbindEvent();
    Object.keys(this._scrollbars).forEach(k => {
      this._scrollbars[k].parentNode.removeChild(this._scrollbars[k]);
    });
  }
  _unbindEvent() {
    const { _eventHandlers: eventHandlers } = this;

    eventHandlers.forEach(t => {
      t();
    });

    this._eventHandlers = [];
  }
  _bindEvent(container, type, fn, _options?) {
    const { _eventHandlers: eventHandlers } = this;
    const h = addEventListener(container, type, fn, _options);
    eventHandlers.push(h);
    return h;
  }
  _bindEvents() {
    const { container } = this._options;
    const { _scroller: scroller } = this;

    if (container) {
      this._bindEvent(
        container,
        'touchstart',
        e => {
          // Don't react if initial down happens on a form element
          if (
            (e.touches[0] &&
              e.touches[0].container &&
              e.touches[0].container.tagName.match(/input|textarea|select/i)) ||
            this._disabled
          ) {
            return;
          }
          this._clearScrollbarTimer();

          scroller.doTouchStart(e.touches, e.timeStamp);
        },
        willNotPreventDefault,
      );

      const onTouchEnd = e => {
        scroller.doTouchEnd(e.timeStamp);
      };

      this._bindEvent(container, 'touchmove', e => {
        scroller.doTouchMove(e.touches, e.timeStamp, e.scale);
        iOSWebViewFix(e, onTouchEnd);
      });

      this._bindEvent(container, 'touchend', onTouchEnd);
      this._bindEvent(container, 'touchcancel', onTouchEnd);

      this._bindEvent(
        container,
        'wheel',
        e => {
          this._onContainerMouseWheel(e);
        },
        false,
      );
    }

    Object.keys(this._indicators).forEach(type => {
      const indicator = this._indicators[type];
      this._bindEvent(indicator, 'mousedown', e => {
        if (e.button === 0) {
          this._onIndicatorMouseDown(e);
          let moveHandler = this._bindEvent(document, 'mousemove', e => {
            this._onIndicatorMouseMove(e, type);
          });
          let upHandler = this._bindEvent(document, 'mouseup', e => {
            this._onIndicatorMouseUp(e);
            moveHandler();
            upHandler();
          });
        }
      });
    });

    Object.keys(this._scrollbars).forEach(type => {
      const bar = this._scrollbars[type];
      this._bindEvent(bar, 'mousedown', e => {
        if (e.button === 0) {
          this._onScrollbarMouseDown(e, type);
          let upHandler = this._bindEvent(document, 'mouseup', e => {
            this._onScrollbarMouseup(e);
            upHandler();
          });
        }
      });
    });
  }

  scrollTo(x: number, y: number, animate: boolean): void {
    return this._scroller.scrollTo(x, y, animate);
  }

  scrollBy(x: number, y: number, animate: boolean): void {
    return this._scroller.scrollBy(x, y, animate);
  }

  _onIndicatorMouseDown(e) {
    this._initPagePos = {
      pageX: e.pageX,
      pageY: e.pageY,
      left: this._scroller.__scrollLeft,
      top: this._scroller.__scrollTop,
    };
    preventDefault(e);
    e.stopPropagation();
  }

  _onIndicatorMouseMove(e, type) {
    if (!this.__onIndicatorStartMouseMoving) {
      document.body.setAttribute('unselectable', 'on');
      this.__onIndicatorStartMouseMoving = true;
    }
    if (type === 'x') {
      this._scroller.scrollTo(
        (e.pageX - this._initPagePos.pageX) * this._ratio.x +
          this._initPagePos.left,
        this._initPagePos.top,
        false,
      );
    } else {
      this._scroller.scrollTo(
        this._initPagePos.left,
        (e.pageY - this._initPagePos.pageY) * this._ratio.y +
          this._initPagePos.top,
        false,
      );
    }
    preventDefault(e);
    e.stopPropagation();
  }

  _onIndicatorMouseUp(e) {
    this.__onIndicatorStartMouseMoving = false;
    document.body.removeAttribute('unselectable');
    preventDefault(e);
    e.stopPropagation();
  }

  _onContainerMouseWheel(e: any) {
    this._scroller.scrollBy(deltaX(e), deltaY(e), false);
    preventDefault(e);
  }

  _onScrollbarMouseDown(e, type) {
    let init = true;
    const { pageX, pageY } = e;
    let offset = this._scrollbars[type].getBoundingClientRect();
    offset = {
      left: offset.left,
      top: offset.top,
    };
    offset.left += window.pageXOffset;
    offset.top += window.pageYOffset;
    let direction = 0;
    const viewportSize =
      type === 'x'
        ? this._options.viewport.width
        : this._options.viewport.height;

    if (this._containerMouseDownTimer) {
      return;
    }
    if (type === 'x') {
      direction =
        pageX - offset.left - this._scroller.__scrollLeft / this._ratio.x;
    } else {
      direction =
        pageY - offset.top - this._scroller.__scrollTop / this._ratio.y;
    }
    if (direction) {
      direction = direction > 0 ? 1 : -1;
    }
    const doScroll = () => {
      let pos = 0;
      const scrollPosition = this._scroller[
        type === 'x' ? '__scrollLeft' : '__scrollTop'
      ];
      const indicatorSize = this._indicatorsSize[type];
      if (type === 'x') {
        pos = pageX - offset.left - scrollPosition / this._ratio.x;
      } else {
        pos = pageY - offset.top - scrollPosition / this._ratio.y;
      }
      if (pos * direction < 0 || (pos >= 0 && pos < indicatorSize)) {
        this._endScroll();
        return;
      }
      if (direction) {
        if (type === 'x') {
          this._scroller.scrollBy(viewportSize * direction, 0, false);
        } else {
          this._scroller.scrollBy(0, viewportSize * direction, false);
        }
      } else {
        this._endScroll();
        return;
      }

      this._containerMouseDownTimer = setTimeout(doScroll, init ? 300 : 70);

      init = false;
    };
    doScroll();
    preventDefault(e);
  }

  _endScroll() {
    if (this._containerMouseDownTimer) {
      clearTimeout(this._containerMouseDownTimer);
    }
    this._containerMouseDownTimer = null;
  }

  _onScrollbarMouseup(e) {
    this._endScroll();
    preventDefault(e);
  }
}

export default ZScroller;
