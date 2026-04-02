/*
 * onScan.js - scan-events for hardware barcodes scanners in javascript
 * TypeScript port – full type-safety, zero runtime changes vs. the original.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Debug/error object passed to onScanError and the 'scanError' DOM event. */
export interface ScanError {
  message: string;
  scanCode: string;
  scanDuration: number;
  avgTimeByChar: number;
  minLength: number;
}

/** Detail shape of the custom 'scan' DOM event. */
export interface ScanEventDetail {
  scanCode: string;
  qty: number;
}

/**
 * Full configuration object for onScan.js.
 * Every field is required internally; pass Partial<OnScanOptions> to attachTo / setOptions.
 */
export interface OnScanOptions {
  /** Callback after detection of a successful scan. */
  onScan: (this: Element, scanCode: string, qty: number) => void;
  /** Callback after a scanned string is dropped due to restrictions. */
  onScanError: (this: Element, error: ScanError) => void;
  /**
   * Callback after a key event was decoded and found to be part of a
   * potential scan code.  `char` is undefined when the key was a suffix/prefix.
   */
  onKeyProcess: (
    this: Element,
    char: string | number | undefined,
    event: KeyboardEvent
  ) => void;
  /**
   * Callback after every detected keyDown event.
   * Return `false` to cancel further processing of that event.
   */
  onKeyDetect: (
    this: Element,
    keyCode: number,
    event: KeyboardEvent
  ) => boolean | void;
  /** Callback after detecting a paste (only when reactToPaste is true). */
  onPaste: (this: Element, pasted: string, event: ClipboardEvent) => void;
  /**
   * Custom function to decode a keydown event into a character.
   * Return null to ignore the event entirely.
   */
  keyCodeMapper: (
    this: Element,
    event: KeyboardEvent
  ) => string | number | null;
  /**
   * Callback fired when the hardware scan button is held down longer than
   * scanButtonLongPressTime.  The element the scanner is attached to is
   * passed as the first argument (via setTimeout's extra-args feature).
   */
  onScanButtonLongPress: (element: Element) => void;
  /** Key code of the scanner hardware button, or false if not applicable. */
  scanButtonKeyCode: number | false;
  /** How long (ms) the hardware button must be pressed to trigger onScanButtonLongPress. */
  scanButtonLongPressTime: number;
  /** Wait duration (ms) after keypress event before checking if scanning finished. */
  timeBeforeScanTest: number;
  /** Average time (ms) between two chars; used to detect scanner vs. keyboard. */
  avgTimeByChar: number;
  /** Minimum code length that counts as a valid scan. */
  minLength: number;
  /** Key codes that signal the END of a scan (will be suppressed). */
  suffixKeyCodes: number[];
  /** Key codes that signal the START of a scan (will be suppressed). */
  prefixKeyCodes: number[];
  /**
   * CSS selector, array of CSS selectors, or false.
   * Scans are ignored when the focused element matches.
   */
  ignoreIfFocusOn: false | string | string[];
  /** Stop immediate propagation of successfully processed key events. */
  stopPropagation: boolean;
  /** Prevent default action of successfully processed key events. */
  preventDefault: boolean;
  /** Capture events before any listener deeper in the DOM tree. */
  captureEvents: boolean;
  /** React to keyboard (keydown) events. */
  reactToKeydown: boolean;
  /** React to paste events. */
  reactToPaste: boolean;
  /** Quantity returned with each successful scan. */
  singleScanQty: number;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface ScannerVars {
  firstCharTime: number;
  lastCharTime: number;
  accumulatedString: string;
  testTimer: ReturnType<typeof setTimeout> | false;
  longPressTimer: ReturnType<typeof setTimeout> | undefined;
  longPressTimeStart: number;
  longPressed: boolean;
}

interface ScannerDetectionData {
  options: OnScanOptions;
  vars: ScannerVars;
}

/** Extends Element with the private scannerDetectionData bag. */
export interface OnScanElement extends Element {
  scannerDetectionData?: ScannerDetectionData;
}

/** Accepted values for the simulate() method. */
export type SimulateInput = string | Array<number | KeyboardEventInit>;

// ---------------------------------------------------------------------------
// onScan singleton – explicit interface to avoid circular-reference errors
// ---------------------------------------------------------------------------

interface OnScanInstance {
  attachTo(
    oDomElement: OnScanElement,
    oOptions?: Partial<OnScanOptions>
  ): OnScanInstance;
  detachFrom(oDomElement: OnScanElement): void;
  getOptions(oDomElement: OnScanElement): OnScanOptions;
  setOptions(
    oDomElement: OnScanElement,
    oOptions: Partial<OnScanOptions>
  ): OnScanInstance;
  decodeKeyEvent(oEvent: KeyboardEvent): string | number;
  simulate(oDomElement: OnScanElement, mStringOrArray: SimulateInput): OnScanInstance;
  isScanInProgressFor(oDomElement: OnScanElement): boolean;
  isAttachedTo(oDomElement: OnScanElement): boolean;
  _reinitialize(oDomElement: OnScanElement): void;
  _isFocusOnIgnoredElement(oDomElement: OnScanElement): boolean;
  _validateScanCode(oDomElement: OnScanElement, sScanCode: string): boolean;
  _mergeOptions<T extends object>(oDefaults: T, oOptions: Partial<T>): T;
  _getNormalizedKeyNum(e: KeyboardEvent): number;
  _handleKeyDown(this: OnScanElement, e: KeyboardEvent): void;
  _handlePaste(this: OnScanElement, e: ClipboardEvent): void;
  _handleKeyUp(this: OnScanElement, e: KeyboardEvent): void;
}

const onScan: OnScanInstance = {
  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Attaches scan detection to a DOM element.
   *
   * @param oDomElement  Target DOM element (use `document` for global detection).
   * @param oOptions     Partial options object; missing keys use defaults.
   */
  attachTo(
    oDomElement: OnScanElement,
    oOptions?: Partial<OnScanOptions>
  ): typeof onScan {
    if (oDomElement.scannerDetectionData !== undefined) {
      throw new Error(
        'onScan.js is already initialized for DOM element ' + oDomElement
      );
    }

    const oDefaults: OnScanOptions = {
      onScan: function () {},
      onScanError: function () {},
      onKeyProcess: function () {},
      onKeyDetect: function () {},
      onPaste: function () {},
      keyCodeMapper: function (oEvent: KeyboardEvent) {
        return onScan.decodeKeyEvent(oEvent);
      },
      onScanButtonLongPress: function () {},
      scanButtonKeyCode: false,
      scanButtonLongPressTime: 500,
      timeBeforeScanTest: 100,
      avgTimeByChar: 30,
      minLength: 6,
      suffixKeyCodes: [9, 13],
      prefixKeyCodes: [],
      ignoreIfFocusOn: false,
      stopPropagation: false,
      preventDefault: false,
      captureEvents: false,
      reactToKeydown: true,
      reactToPaste: false,
      singleScanQty: 1,
    };

    const mergedOptions = this._mergeOptions(oDefaults, oOptions ?? {});

    oDomElement.scannerDetectionData = {
      options: mergedOptions,
      vars: {
        firstCharTime: 0,
        lastCharTime: 0,
        accumulatedString: '',
        testTimer: false,
        longPressTimer: undefined,
        longPressTimeStart: 0,
        longPressed: false,
      },
    };

    if (mergedOptions.reactToPaste === true) {
      oDomElement.addEventListener(
        'paste',
        onScan._handlePaste as EventListener,
        mergedOptions.captureEvents
      );
    }
    if (mergedOptions.scanButtonKeyCode !== false) {
      oDomElement.addEventListener(
        'keyup',
        onScan._handleKeyUp as EventListener,
        mergedOptions.captureEvents
      );
    }
    if (
      mergedOptions.reactToKeydown === true ||
      mergedOptions.scanButtonKeyCode !== false
    ) {
      oDomElement.addEventListener(
        'keydown',
        onScan._handleKeyDown as EventListener,
        mergedOptions.captureEvents
      );
    }

    return this;
  },

  /**
   * Removes all scan detection from a DOM element.
   *
   * @param oDomElement  The element previously passed to attachTo().
   */
  detachFrom(oDomElement: OnScanElement): void {
    if (!oDomElement.scannerDetectionData) return;

    if (oDomElement.scannerDetectionData.options.reactToPaste) {
      oDomElement.removeEventListener(
        'paste',
        onScan._handlePaste as EventListener
      );
    }
    if (oDomElement.scannerDetectionData.options.scanButtonKeyCode !== false) {
      oDomElement.removeEventListener(
        'keyup',
        onScan._handleKeyUp as EventListener
      );
    }
    oDomElement.removeEventListener(
      'keydown',
      onScan._handleKeyDown as EventListener
    );

    oDomElement.scannerDetectionData = undefined;
  },

  /**
   * Returns the current options for an attached element.
   */
  getOptions(oDomElement: OnScanElement): OnScanOptions {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return oDomElement.scannerDetectionData!.options;
  },

  /**
   * Updates options for an already-attached element.
   * Only the provided keys are overwritten; all others remain unchanged.
   */
  setOptions(
    oDomElement: OnScanElement,
    oOptions: Partial<OnScanOptions>
  ): typeof onScan {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const currentData = oDomElement.scannerDetectionData!;

    // Add / remove paste listener when the reactToPaste flag changes
    switch (currentData.options.reactToPaste) {
      case true:
        if (oOptions.reactToPaste === false) {
          oDomElement.removeEventListener(
            'paste',
            onScan._handlePaste as EventListener
          );
        }
        break;
      case false:
        if (oOptions.reactToPaste === true) {
          oDomElement.addEventListener(
            'paste',
            onScan._handlePaste as EventListener
          );
        }
        break;
    }

    // Add / remove keyup listener when the scanButtonKeyCode flag changes
    switch (currentData.options.scanButtonKeyCode) {
      case false:
        if (oOptions.scanButtonKeyCode !== false) {
          oDomElement.addEventListener(
            'keyup',
            onScan._handleKeyUp as EventListener
          );
        }
        break;
      default:
        if (oOptions.scanButtonKeyCode === false) {
          oDomElement.removeEventListener(
            'keyup',
            onScan._handleKeyUp as EventListener
          );
        }
        break;
    }

    currentData.options = this._mergeOptions(currentData.options, oOptions);
    this._reinitialize(oDomElement);
    return this;
  },

  /**
   * Transforms a keydown KeyboardEvent into a character.
   *
   * Handled key-code ranges:
   * - 48–90  : letters and regular numbers
   * - 96–105 : numeric keypad numbers (returned as number 0–9)
   * - 106–111: numeric keypad operations (+, -, *, /, etc.)
   *
   * All other key codes yield an empty string.
   */
  decodeKeyEvent(oEvent: KeyboardEvent): string | number {
    const iCode = this._getNormalizedKeyNum(oEvent);
    switch (true) {
      case iCode >= 48 && iCode <= 90: // letters + regular numbers
      case iCode >= 106 && iCode <= 111: // numeric keypad operations
        if (oEvent.key !== undefined && oEvent.key !== '') {
          return oEvent.key;
        }
        {
          let sDecoded = String.fromCharCode(iCode);
          sDecoded = oEvent.shiftKey
            ? sDecoded.toUpperCase()
            : sDecoded.toLowerCase();
          return sDecoded;
        }
      case iCode >= 96 && iCode <= 105: // numeric keypad 0–9
        return 0 + (iCode - 96);
    }
    return '';
  },

  /**
   * Simulates a scan programmatically.
   *
   * @param oDomElement    The element to fire events against.
   * @param mStringOrArray The scan code as:
   *   - a plain string  → validated directly (no key-code decoding)
   *   - number[]        → synthesised keydown events
   *   - KeyboardEventInit[] → synthesised keydown events with full properties
   */
  simulate(
    oDomElement: OnScanElement,
    mStringOrArray: SimulateInput
  ): typeof onScan {
    this._reinitialize(oDomElement);
    if (Array.isArray(mStringOrArray)) {
      mStringOrArray.forEach(function (mKey) {
        let oEventProps: KeyboardEventInit = {};
        if (typeof mKey === 'object' && mKey !== null) {
          oEventProps = mKey as KeyboardEventInit;
        } else {
          oEventProps.keyCode = mKey as number;
        }
        const oEvent = new KeyboardEvent('keydown', oEventProps);
        document.dispatchEvent(oEvent);
      });
    } else {
      this._validateScanCode(oDomElement, mStringOrArray);
    }
    return this;
  },

  /**
   * Returns true if the scanner is currently in the middle of a scan sequence.
   */
  isScanInProgressFor(oDomElement: OnScanElement): boolean {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return oDomElement.scannerDetectionData!.vars.firstCharTime > 0;
  },

  /**
   * Returns true if onScan is currently attached to the given element.
   */
  isAttachedTo(oDomElement: OnScanElement): boolean {
    return oDomElement.scannerDetectionData !== undefined;
  },

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /** @internal */
  _reinitialize(oDomElement: OnScanElement): void {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const oVars = oDomElement.scannerDetectionData!.vars;
    oVars.firstCharTime = 0;
    oVars.lastCharTime = 0;
    oVars.accumulatedString = '';
  },

  /** @internal */
  _isFocusOnIgnoredElement(oDomElement: OnScanElement): boolean {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const ignoreSelectors =
      oDomElement.scannerDetectionData!.options.ignoreIfFocusOn;

    if (!ignoreSelectors) return false;

    const oFocused = document.activeElement;
    if (!oFocused) return false;

    if (Array.isArray(ignoreSelectors)) {
      for (let i = 0; i < ignoreSelectors.length; i++) {
        if (oFocused.matches(ignoreSelectors[i]) === true) {
          return true;
        }
      }
    } else if (oFocused.matches(ignoreSelectors)) {
      return true;
    }

    return false;
  },

  /**
   * Validates the accumulated scan string and fires the appropriate event /
   * callback pair (scan + onScan, or scanError + onScanError).
   *
   * @internal
   */
  _validateScanCode(oDomElement: OnScanElement, sScanCode: string): boolean {
    const oScannerData = oDomElement.scannerDetectionData;
    if (!oScannerData) return false;

    const oOptions = oScannerData.options;
    const iSingleScanQty = oOptions.singleScanQty;
    const iFirstCharTime = oScannerData.vars.firstCharTime;
    const iLastCharTime = oScannerData.vars.lastCharTime;

    let errorMessage: string | undefined;

    switch (true) {
      case sScanCode.length < oOptions.minLength:
        errorMessage = 'Received code is shorter than minimal length';
        break;

      case iLastCharTime - iFirstCharTime >
        sScanCode.length * oOptions.avgTimeByChar:
        errorMessage = 'Received code was not entered in time';
        break;

      default: {
        oOptions.onScan.call(oDomElement, sScanCode, iSingleScanQty);
        const successEvent = new CustomEvent<ScanEventDetail>('scan', {
          detail: { scanCode: sScanCode, qty: iSingleScanQty },
        });
        oDomElement.dispatchEvent(successEvent);
        onScan._reinitialize(oDomElement);
        return true;
      }
    }

    const oScanError: ScanError = {
      message: errorMessage as string,
      scanCode: sScanCode,
      scanDuration: iLastCharTime - iFirstCharTime,
      avgTimeByChar: oOptions.avgTimeByChar,
      minLength: oOptions.minLength,
    };

    oOptions.onScanError.call(oDomElement, oScanError);
    const errorEvent = new CustomEvent<ScanError>('scanError', {
      detail: oScanError,
    });
    oDomElement.dispatchEvent(errorEvent);

    onScan._reinitialize(oDomElement);
    return false;
  },

  /**
   * Shallow-merges two option objects.  Values from oOptions win over oDefaults.
   *
   * @internal
   */
  _mergeOptions<T extends object>(oDefaults: T, oOptions: Partial<T>): T {
    const oExtended = {} as T;
    let prop: keyof T;
    for (prop in oDefaults) {
      if (Object.prototype.hasOwnProperty.call(oDefaults, prop)) {
        oExtended[prop] = oDefaults[prop];
      }
    }
    for (prop in oOptions) {
      if (Object.prototype.hasOwnProperty.call(oOptions, prop)) {
        oExtended[prop] = oOptions[prop] as T[keyof T];
      }
    }
    return oExtended;
  },

  /**
   * Normalises the key code from a KeyboardEvent, handling older browsers
   * that only expose `which` or `keyCode`.
   *
   * @internal
   */
  _getNormalizedKeyNum(e: KeyboardEvent): number {
    return e.which || e.keyCode;
  },

  // -------------------------------------------------------------------------
  // Event handlers
  //
  // These are regular (non-arrow) functions because they are registered via
  // addEventListener – inside each handler `this` is the DOM element the
  // listener was attached to.
  // -------------------------------------------------------------------------

  /** @internal */
  _handleKeyDown(this: OnScanElement, e: KeyboardEvent): void {
    const iKeyCode = onScan._getNormalizedKeyNum(e);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const oOptions = this.scannerDetectionData!.options;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const oVars = this.scannerDetectionData!.vars;
    let bScanFinished = false;
    let character: string | number | undefined;

    if (oOptions.onKeyDetect.call(this, iKeyCode, e) === false) {
      return;
    }

    if (onScan._isFocusOnIgnoredElement(this)) {
      return;
    }

    // If it's just the scanner hardware button, don't treat it as input
    if (
      oOptions.scanButtonKeyCode !== false &&
      iKeyCode === oOptions.scanButtonKeyCode
    ) {
      if (!oVars.longPressed) {
        oVars.longPressTimer = setTimeout(
          oOptions.onScanButtonLongPress,
          oOptions.scanButtonLongPressTime,
          this
        );
        oVars.longPressed = true;
      }
      return;
    }

    switch (true) {
      // Suffix key → end of scan
      case oVars.firstCharTime !== 0 &&
        oOptions.suffixKeyCodes.indexOf(iKeyCode) !== -1:
        e.preventDefault();
        e.stopImmediatePropagation();
        bScanFinished = true;
        break;

      // Prefix key before first real char → start-of-scan marker, discard
      case oVars.firstCharTime === 0 &&
        oOptions.prefixKeyCodes.indexOf(iKeyCode) !== -1:
        e.preventDefault();
        e.stopImmediatePropagation();
        bScanFinished = false;
        break;

      default: {
        const ch = oOptions.keyCodeMapper.call(this, e);
        if (ch === null) {
          return;
        }
        character = ch;
        oVars.accumulatedString += character;

        if (oOptions.preventDefault) {
          e.preventDefault();
        }
        if (oOptions.stopPropagation) {
          e.stopImmediatePropagation();
        }

        bScanFinished = false;
        break;
      }
    }

    if (!oVars.firstCharTime) {
      oVars.firstCharTime = Date.now();
    }
    oVars.lastCharTime = Date.now();

    if (oVars.testTimer !== false) {
      clearTimeout(oVars.testTimer);
    }

    if (bScanFinished) {
      onScan._validateScanCode(this, oVars.accumulatedString);
      oVars.testTimer = false;
    } else {
      oVars.testTimer = setTimeout(
        onScan._validateScanCode,
        oOptions.timeBeforeScanTest,
        this,
        oVars.accumulatedString
      );
    }

    oOptions.onKeyProcess.call(this, character, e);
  },

  /** @internal */
  _handlePaste(this: OnScanElement, e: ClipboardEvent): void {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const oOptions = this.scannerDetectionData!.options;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const oVars = this.scannerDetectionData!.vars;

    // Support IE's window.clipboardData alongside the standard API
    const clipboardData =
      e.clipboardData ||
      (window as Window & { clipboardData?: DataTransfer }).clipboardData;
    const sPasteString = clipboardData ? clipboardData.getData('text') : '';

    if (onScan._isFocusOnIgnoredElement(this)) {
      return;
    }

    e.preventDefault();

    if (oOptions.stopPropagation) {
      e.stopImmediatePropagation();
    }

    oOptions.onPaste.call(this, sPasteString, e);

    oVars.firstCharTime = 0;
    oVars.lastCharTime = 0;

    onScan._validateScanCode(this, sPasteString);
  },

  /** @internal */
  _handleKeyUp(this: OnScanElement, e: KeyboardEvent): void {
    if (onScan._isFocusOnIgnoredElement(this)) {
      return;
    }

    const iKeyCode = onScan._getNormalizedKeyNum(e);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const data = this.scannerDetectionData!;

    if (iKeyCode === data.options.scanButtonKeyCode) {
      clearTimeout(data.vars.longPressTimer);
      data.vars.longPressed = false;
    }
  },
};

export default onScan;
export { onScan };
