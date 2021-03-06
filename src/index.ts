import Scroller from './Scroller';
import {
  isTouch,
  TOUCH_START_EVENT,
  TOUCH_MOVE_EVENT,
  TOUCH_END_EVENT,
  TOUCH_CANCEL_EVENT,
  MOUSE_DOWN_EVENT,
  MOUSE_MOVE_EVENT,
  MOUSE_UP_EVENT,
  preventDefault,
  setTransform,
  iOSWebViewFix,
  addEventListener,
  deltaX,
  deltaY,
} from './utils';

interface IViewportSize {
  width: number;
  height: number;
}

interface IContentSize {
  width: number;
  height: number;
}

interface IXY {
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

type Axis = 'x' | 'y';

type X = IXY & { width: number };

type Y = IXY & { height: number };

export interface IZScrollerOption {
  autohideScrollbar?: boolean;
  minZoom?: number;
  maxZoom?: number;
  minIndicatorSize?: number;
  zooming?: boolean;
  // defaults to true
  bouncing?: boolean;
  // defaults to true
  locking?: boolean;
  viewport: IViewportSize;
  content: IContentSize;
  x?: X;
  y?: Y;
  defaultScrollX?: number;
  defaultScrollY?: number;
  defaultZoom?: number;
  container?: HTMLElement;
  scrollingComplete?: () => any;
  onScroll?: (x: number, y: number, zoom: number) => any;
}

const SPRING_MIN_INDICATOR_SIZE = 8;

type XY = { x?: number; y?: number };

const wheelEvent =
  typeof document !== undefined && 'onwheel' in document
    ? 'wheel'
    : 'mousewheel';

class ZScroller {
  private _containerMouseDownTimer: any;
  private _options: IZScrollerOption;
  private _zOptions: any;
  private _destroyed: boolean;
  private _timer: any;
  private _touchTimer: any;
  private _scrollbars: Record<Axis, HTMLElement>;
  private _indicators: Record<Axis, HTMLElement>;
  private _indicatorsSize: Record<Axis, number>;
  private _indicatorsPos: Record<Axis, number>;
  private _scrollbarsOpacity: Record<Axis, number>;
  private _scroller: any;
  private _disabled: boolean;
  private _eventHandlers: any[];
  private __onIndicatorStartMouseMoving: boolean;
  private _insideUserEvent: boolean;
  private _scrollbarsDisplay: any;
  private _minIndicatorSize: number;
  private _initPagePos: {
    pageX: number;
    pageY: number;
    left: number;
    top: number;
    ratio: XY;
  };
  constructor(_options: IZScrollerOption) {
    const {
      container,
      viewport,
      content,
      onScroll,
      autohideScrollbar,
      x,
      y,
      minIndicatorSize,
      ...zOptions
    } = _options;
    let scrollbars;
    let indicators;
    let indicatorsSize;
    let indicatorsPos;

    let autohideScrollbarFlag=autohideScrollbar;

    this._minIndicatorSize = minIndicatorSize || 25;

    this._options = _options;

    if (autohideScrollbar === undefined) {
      autohideScrollbarFlag = isTouch;
    }

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
          if (scrollbars && autohideScrollbarFlag) {
            this.autoHideScrollbarForTouch();
          }
        }, 0);
      },
    };

    scrollbars = this._scrollbars = { x: null, y: null };
    indicators = this._indicators = { x: null, y: null };
    indicatorsSize = this._indicatorsSize = { x: -1, y: -1 };
    indicatorsPos = this._indicatorsPos = { x: -1, y: -1 };
    this._scrollbarsOpacity = { x: -1, y: -1 };

    this._scrollbarsDisplay = {
      x: '',
      y: '',
    };

    ['x', 'y'].forEach(k => {
      const optionName = k === 'x' ? 'scrollingX' : 'scrollingY';
      const scrollerStyle = k === 'x' ? x : y;
      if (this._options[optionName] !== false) {
        const bar = (scrollbars[k] = document.createElement('div'));
        if (!this._isShowScroll(k)) {
          this._setScrollBarDisplay(k, 'none');
        }
        bar.className = `zscroller-scrollbar zscroller-scrollbar-${k}`;
        if (scrollerStyle.scrollbar) {
          if (scrollerStyle.scrollbar.style) {
            Object.assign(bar.style, scrollerStyle.scrollbar.style);
          }
          if (scrollerStyle.scrollbar.className) {
            bar.className += ' ' + scrollerStyle.scrollbar.className;
          }
        }
        if (scrollerStyle.width) {
          bar.style.width = scrollerStyle.width + 'px';
        }
        if (scrollerStyle.height) {
          bar.style.height = scrollerStyle.height + 'px';
        }
        indicators[k] = document.createElement('div');
        indicators[k].style.userSelect = 'none';
        indicators[k].setAttribute('unselectable', 'on');
        indicators[
          k
        ].className = `zscroller-indicator zscroller-indicator-${k}`;
        if (scrollerStyle.indicator) {
          if (scrollerStyle.indicator.style) {
            Object.assign(indicators[k].style, scrollerStyle.indicator.style);
          }
          if (scrollerStyle.indicator.className) {
            indicators[k].className += ' ' + scrollerStyle.indicator.className;
          }
        }
        bar.appendChild(indicators[k]);
        indicatorsSize[k] = -1;
        this._setScrollbarOpacity(k, 0);
        indicatorsPos[k] = 0;
      }
    });

    // create Scroller instance
    this._scroller = new Scroller((left, top, zoom) => {
      this.clearAutoHideScrollbarForTouchTimer();
      this._adjustScrollBar();
      if (_options.onScroll) {
        _options.onScroll(left, top, zoom);
      }
    }, this._zOptions);

    this._eventHandlers = [];

    this.setDimensions();

    // bind events
    this._bindEvents();

    if (autohideScrollbarFlag) {
      this._setScrollbarOpacity('x', 0);
      this._setScrollbarOpacity('y', 0);
    }
  }

  clearAutoHideScrollbarForTouchTimer() {
    if (this._touchTimer) {
      clearTimeout(this._touchTimer);
      this._touchTimer = null;
    }
  }

  autoHideScrollbarForTouch() {
    this.clearAutoHideScrollbarForTouchTimer();
    this._touchTimer = setTimeout(() => {
      ['x', 'y'].forEach(k => {
        if (this._scrollbars[k]) {
          this._setScrollbarOpacity(k, 0);
        }
      });
    }, 1500);
  }

  _isShowScroll(prop: string) {
    const { content, viewport } = this._options;
    return prop === 'x'
      ? content.width && viewport.width
      : content.height && viewport.height;
  }

  _getZoomedContentWidth() {
    return this._options.content.width * this._scroller.__zoomLevel;
  }

  _getZoomedContentHeight() {
    return this._options.content.height * this._scroller.__zoomLevel;
  }

  _adjustScrollBar() {
    const _options = this._options;
    const scrollbars = this._scrollbars;
    const { x, y } = this._options;
    if (scrollbars) {
      ['x', 'y'].forEach(k => {
        if (scrollbars[k]) {
          if (this._isShowScroll(k)) {
            this._setScrollBarDisplay(k, '');
            const pos =
              k === 'x'
                ? this._scroller.__scrollLeft
                : this._scroller.__scrollTop;
            const scrollerSize = k === 'x' ? x.width : y.height;
            const viewportSize =
              k === 'x' ? _options.viewport.width : _options.viewport.height;
            const contentSize =
              k === 'x'
                ? this._getZoomedContentWidth()
                : this._getZoomedContentHeight();
            if (viewportSize >= contentSize) {
              this._setScrollbarOpacity(k, 0);
            } else {
              this._setScrollbarOpacity(k, 1);
              const normalIndicatorSize =
                (viewportSize / contentSize) * scrollerSize;
              let size = normalIndicatorSize;
              let indicatorPos;
              if (pos < 0) {
                size = Math.max(
                  normalIndicatorSize + pos,
                  SPRING_MIN_INDICATOR_SIZE,
                );
                indicatorPos = 0;
              } else if (pos > contentSize - viewportSize) {
                size = Math.max(
                  normalIndicatorSize + contentSize - viewportSize - pos,
                  SPRING_MIN_INDICATOR_SIZE,
                );
                indicatorPos = scrollerSize - size;
              } else {
                size = Math.max(size, this._minIndicatorSize);
                indicatorPos =
                  (pos / (contentSize - viewportSize)) * (scrollerSize - size);
                indicatorPos = Math.min(indicatorPos, scrollerSize - size);
              }
              this._setIndicatorSize(k, size);
              this._setIndicatorPos(k, indicatorPos);
            }
          } else {
            this._setScrollBarDisplay(k, 'none');
          }
        }
      });
    }
  }

  _adjustScrollBarDisplay() {
    let changed = false;
    ['x', 'y'].forEach(p => {
      if (this._isShowScroll(p)) {
        changed = changed || this._setScrollBarDisplay(p, '');
      } else {
        this._setScrollBarDisplay(p, 'none');
      }
    });
    if (changed) {
      this._adjustScrollBar();
    }
  }

  _setScrollBarDisplay(prop: string, value: string) {
    const bar = this._scrollbars[prop];
    const scrollbarsVisible = this._scrollbarsDisplay;
    if (bar) {
      if (value !== scrollbarsVisible[prop]) {
        bar.style.display = value;
        scrollbarsVisible[prop] = value;
        return true;
      }
    }
    return false;
  }

  getScrollPosition() {
    return {
      X: this._scroller.__scrollLeft,
      y: this._scroller.__scrollTop,
    };
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
    if (isTouch) {
      if (
        !opacity ||
        (this._insideUserEvent && this._scrollbarsOpacity[axis] !== opacity)
      ) {
        this._scrollbars[axis].style.opacity = opacity;
        this._scrollbarsOpacity[axis] = opacity;
      }
    } else {
      if (this._scrollbarsOpacity[axis] !== opacity) {
        this._scrollbars[axis].style.opacity = opacity;
        this._scrollbarsOpacity[axis] = opacity;
      }
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
    viewport?: IViewportSize;
    content?: IContentSize;
    x?: X;
    y?: Y;
  } = {}) {
    const { _options, _scroller: scroller } = this;
    Object.assign(_options.x, x);
    Object.assign(_options.y, y);
    Object.assign(_options.content, content);
    Object.assign(_options.viewport, viewport);

    this._adjustScrollBarDisplay();

    // set the right scroller dimensions
    scroller.setDimensions(
      _options.viewport.width,
      _options.viewport.height,
      _options.content.width,
      _options.content.height,
    );
  }

  _getRatio() {
    const ratio: XY = {};
    const { _options, _indicatorsSize } = this;
    if (_options.x && _options.x.width) {
      ratio.x =
        (this._getZoomedContentWidth() - _options.viewport.width) /
        (_options.x.width - _indicatorsSize.x);
    }
    if (_options.y && _options.y.height) {
      ratio.y =
        (this._getZoomedContentHeight() - _options.viewport.height) /
        (_options.y.height - _indicatorsSize.y);
    }
    return ratio;
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
  _bindEvent(save, container, type, fn, _options?) {
    const { _eventHandlers: eventHandlers } = this;
    const h = addEventListener(container, type, fn, _options);
    if (save) {
      eventHandlers.push(h);
    }
    return h;
  }
  _bindEvents() {
    const { container } = this._options;
    const { _scroller: scroller } = this;

    if (container) {
      if (isTouch) {
        const onTouchStart = (container, touches, timeStamp) => {
          // Don't react if initial down happens on a form element
          if (
            (container && container.tagName.match(/input|textarea|select/i)) ||
            this._disabled
          ) {
            return;
          }
          this._clearScrollbarTimer();
          this._insideUserEvent = true;
          scroller.doTouchStart(touches, timeStamp);
        };

        this._bindEvent(
          true,
          container,
          TOUCH_START_EVENT,
          e => {
            if (e.touches) {
              onTouchStart(
                e.touches[0] && e.touches[0].container,
                e.touches,
                e.timeStamp,
              );
            } else {
              onTouchStart(e.target, [e], e.timeStamp);
            }
          },
          false,
        );

        const onTouchEnd = e => {
          this._insideUserEvent = false;
          scroller.doTouchEnd(e.timeStamp);
        };

        const onTouchMove = (e, touches) => {
          e.preventDefault();
          scroller.doTouchMove(touches, e.timeStamp);
          iOSWebViewFix(e, onTouchEnd);
        };

        this._bindEvent(
          true,
          container,
          'touchmove',
          e => {
            if (this._insideUserEvent) {
              const touches = e.touches ? e.touches : [e];
              onTouchMove(e, touches);
            }
          },
          false,
        );

        this._bindEvent(true, container, TOUCH_END_EVENT, onTouchEnd, false);
        this._bindEvent(true, container, TOUCH_CANCEL_EVENT, onTouchEnd, false);
      }

      // prevent Horizontal Scrolling by default
      this._bindEvent(
        true,
        container,
        wheelEvent,
        e => {
          this._insideUserEvent = true;
          this._onContainerMouseWheel(e);
          this._insideUserEvent = false;
        },
        false,
      );
    }

    Object.keys(this._indicators).forEach((type: string) => {
      const indicator = this._indicators[type];
      this._bindEvent(
        true,
        indicator,
        MOUSE_DOWN_EVENT,
        e => {
          if (e.button === 0) {
            this._insideUserEvent = true;
            this._onIndicatorMouseDown(e, type);
            let moveHandler = this._bindEvent(
              false,
              document,
              MOUSE_MOVE_EVENT,
              e => {
                this._onIndicatorMouseMove(e, type as Axis);
              },
            );
            const leaveFn = e => {
              this._onIndicatorMouseUp(e, type as Axis);
              moveHandler();
              upHandler();
              this._insideUserEvent = false;
            };
            let upHandler = this._bindEvent(
              false,
              document,
              MOUSE_UP_EVENT,
              leaveFn,
            );
          }
        },
        false,
      );
    });

    Object.keys(this._scrollbars).forEach(type => {
      const bar = this._scrollbars[type];
      this._bindEvent(
        true,
        bar,
        MOUSE_DOWN_EVENT,
        e => {
          if (e.button === 0) {
            this._insideUserEvent = true;
            this._onScrollbarMouseDown(e, type as Axis);
            let upHandler = this._bindEvent(
              false,
              window,
              MOUSE_UP_EVENT,
              e => {
                this._onScrollbarMouseup(e);
                upHandler();
                this._insideUserEvent = false;
              },
            );
          }
        },
        false,
      );
    });
  }

  zoomTo(
    level: number,
    originLeft?: number,
    originTop?: number,
    animate?: boolean,
    callback?: Function,
  ) {
    return this._scroller.zoomTo(
      level,
      animate,
      originLeft,
      originTop,
      callback,
    );
  }

  zoomBy(
    factor: number,
    originLeft?: number,
    originTop?: number,
    animate?: boolean,
    callback?: Function,
  ) {
    return this._scroller.zoomBy(
      factor,
      animate,
      originLeft,
      originTop,
      callback,
    );
  }

  scrollTo(x: number, y: number, animate?: boolean): void {
    return this._scroller.scrollTo(x, y, animate);
  }

  scrollBy(x: number, y: number, animate?: boolean): void {
    return this._scroller.scrollBy(x, y, animate);
  }

  _onIndicatorMouseDown(e: MouseEvent, type: string) {
    this._initPagePos = {
      pageX: e.pageX,
      pageY: e.pageY,
      left: this._scroller.__scrollLeft,
      top: this._scroller.__scrollTop,
      ratio: this._getRatio(),
    };
    this._indicators[type].classList.add(
      `zscroller-indicator-active`,
      `zscroller-indicator-${type}-active`,
    );
    // https://taye.me/blog/tips/2015/11/16/mouse-drag-outside-iframe/
    // e.preventDefault();
    e.stopPropagation();
  }

  _onIndicatorMouseMove(e: MouseEvent, type: Axis) {
    if (!this.__onIndicatorStartMouseMoving) {
      document.body.setAttribute('unselectable', 'on');
      this.__onIndicatorStartMouseMoving = true;
    }
    if (type === 'x') {
      this._scroller.scrollTo(
        (e.pageX - this._initPagePos.pageX) * this._initPagePos.ratio.x +
        this._initPagePos.left,
        this._initPagePos.top,
        false,
      );
    } else {
      this._scroller.scrollTo(
        this._initPagePos.left,
        (e.pageY - this._initPagePos.pageY) * this._initPagePos.ratio.y +
        this._initPagePos.top,
        false,
      );
    }
    preventDefault(e);
    e.stopPropagation();
  }

  _onIndicatorMouseUp(e: MouseEvent, type: Axis) {
    this.__onIndicatorStartMouseMoving = false;
    this._indicators[type].classList.remove(
      `zscroller-indicator-active`,
      `zscroller-indicator-${type}-active`,
    );
    document.body.removeAttribute('unselectable');
    preventDefault(e);
    e.stopPropagation();
  }

  _onContainerMouseWheel(e: any) {
    let deltaXValue = deltaX(e);
    let deltaYValue = deltaY(e);
    if (!deltaXValue && !deltaYValue) {
      return;
    }
    if (!deltaXValue && !this._isShowScroll('y')) {
      return;
    }
    if (!deltaYValue && !this._isShowScroll('x')) {
      return;
    }
    if (deltaXValue && deltaYValue && this._options.locking !== false) {
      const distanceX = Math.abs(deltaXValue);
      const distanceY = Math.abs(deltaYValue);
      const radian = Math.atan2(distanceY, distanceX);
      if (radian < Math.PI / 4) {
        deltaYValue = 0;
      } else {
        deltaXValue = 0;
      }
    }
    this._scroller.scrollBy(deltaXValue, deltaYValue, false);
    e.preventDefault();
    if (e.wheelDeltaX !== 0) {
      e.stopPropagation();
    }
  }

  _onScrollbarMouseDown(e: MouseEvent, type: Axis) {
    let init = true;
    const { pageX, pageY } = e;
    const domRect = this._scrollbars[type].getBoundingClientRect();
    let ratio = this._getRatio();
    const offset = {
      left: domRect.left,
      top: domRect.top,
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
      direction = pageX - offset.left - this._scroller.__scrollLeft / ratio.x;
    } else {
      direction = pageY - offset.top - this._scroller.__scrollTop / ratio.y;
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
        pos = pageX - offset.left - scrollPosition / ratio.x;
      } else {
        pos = pageY - offset.top - scrollPosition / ratio.y;
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
    e.preventDefault();
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
