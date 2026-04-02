# onScan.js – TypeScript Guide

This document covers everything you need to use the **TypeScript port** of onScan.js
in your project. All original logic and behaviour are preserved; the only addition is
full static type-safety.

---

## Table of Contents

1. [Installation & Build](#1-installation--build)
2. [Exported Types](#2-exported-types)
3. [Quick Start (Vanilla TypeScript)](#3-quick-start-vanilla-typescript)
4. [Options Reference](#4-options-reference)
5. [Methods Reference](#5-methods-reference)
6. [Events Reference](#6-events-reference)
7. [Decoding Key Codes](#7-decoding-key-codes)
8. [Simulating Scans](#8-simulating-scans)
9. [Framework Integration](#9-framework-integration)
   - [React (Hook)](#91-react-hook)
   - [Angular (Service)](#92-angular-service)
   - [Vue 3 (Composable)](#93-vue-3-composable)
   - [Next.js](#94-nextjs)
   - [Nuxt 3](#95-nuxt-3)
10. [Typing DOM Events](#10-typing-dom-events)
11. [Listening to Typed Custom Events](#11-listening-to-typed-custom-events)

---

## 1. Installation & Build

```bash
# Install the package
npm install onscan.js

# Install TypeScript if you don't have it yet
npm install --save-dev typescript

# Compile the TypeScript source
npm run build        # runs: tsc
# Output is placed in dist/
#   dist/onscan.js      ← compiled JavaScript
#   dist/onscan.d.ts    ← type declarations
#   dist/onscan.js.map  ← source map
```

The compiled `dist/` output is what gets resolved when you import the package.
The `types` field in `package.json` points to `dist/onscan.d.ts`, so editors and
the TypeScript compiler pick up all types automatically.

---

## 2. Exported Types

```ts
import onScan from 'onscan.js';
import type {
  OnScanOptions,    // Full options object (use Partial<OnScanOptions> when calling attachTo)
  ScanError,        // Argument to onScanError callback and 'scanError' CustomEvent.detail
  ScanEventDetail,  // Detail of the 'scan' CustomEvent  { scanCode: string; qty: number }
  OnScanElement,    // Element extended with internal scannerDetectionData
  SimulateInput,    // string | Array<number | KeyboardEventInit>
} from 'onscan.js';
```

### `OnScanOptions`

All 20 configuration fields, fully typed. Every field is optional when passed to
`attachTo()` or `setOptions()` – use `Partial<OnScanOptions>` at the call site.

### `ScanError`

```ts
interface ScanError {
  message: string;       // Human-readable reason
  scanCode: string;      // The rejected scan string
  scanDuration: number;  // Actual duration in ms
  avgTimeByChar: number; // Configured avg time per char
  minLength: number;     // Configured minimum length
}
```

### `ScanEventDetail`

```ts
interface ScanEventDetail {
  scanCode: string;  // Accepted barcode / RFID string
  qty: number;       // Quantity (= singleScanQty option)
}
```

### `OnScanElement`

A plain DOM `Element` extended with the optional internal state bag. Cast your
element to `OnScanElement` when passing it to onScan methods.

### `SimulateInput`

```ts
type SimulateInput = string | Array<number | KeyboardEventInit>;
```

---

## 3. Quick Start (Vanilla TypeScript)

```ts
import onScan from 'onscan.js';
import type { OnScanOptions, OnScanElement } from 'onscan.js';

// Cast document to OnScanElement once; reuse everywhere
const target = document as unknown as OnScanElement;

const options: Partial<OnScanOptions> = {
  suffixKeyCodes: [13],       // Enter key ends a scan
  reactToPaste: true,         // Also handle clipboard-mode scanners
  minLength: 6,

  onScan(scanCode, qty) {
    // `this` is typed as Element (the element onScan is attached to)
    console.log(`${qty}× ${scanCode}`);
  },

  onScanError(err) {
    console.warn('Scan rejected:', err.message, err.scanCode);
  },
};

// Attach
onScan.attachTo(target, options);

// Detach when done (e.g. route change, component unmount)
onScan.detachFrom(target);
```

---

## 4. Options Reference

All fields below are properties of `OnScanOptions`. Pass any subset as
`Partial<OnScanOptions>` – missing fields use the listed default.

### Callbacks

| Option | TypeScript signature | Default | Description |
|--------|---------------------|---------|-------------|
| `onScan` | `(this: Element, scanCode: string, qty: number) => void` | no-op | Fired after a successful scan. |
| `onScanError` | `(this: Element, error: ScanError) => void` | no-op | Fired when a scan is rejected (too short, too slow, etc.). |
| `onKeyProcess` | `(this: Element, char: string \| number \| undefined, event: KeyboardEvent) => void` | no-op | Fired for each key that is accepted as part of a potential scan code. `char` is `undefined` for suffix/prefix keys. |
| `onKeyDetect` | `(this: Element, keyCode: number, event: KeyboardEvent) => boolean \| void` | no-op | Fired for every keydown event. Return `false` to cancel all further processing of that event. |
| `onPaste` | `(this: Element, pasted: string, event: ClipboardEvent) => void` | no-op | Fired on a paste event. Only active when `reactToPaste: true`. |
| `keyCodeMapper` | `(this: Element, event: KeyboardEvent) => string \| number \| null` | `onScan.decodeKeyEvent` | Custom decoder. Return `null` to ignore the event. |
| `onScanButtonLongPress` | `(element: Element) => void` | no-op | Fired when the hardware scan button is held longer than `scanButtonLongPressTime`. Requires `scanButtonKeyCode` to be set. |

### Timing

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `timeBeforeScanTest` | `number` | `100` | Wait (ms) after last keypress before validating the accumulated string. |
| `avgTimeByChar` | `number` | `30` | Maximum average ms per character. Sequences slower than `length × avgTimeByChar` are rejected. |
| `scanButtonLongPressTime` | `number` | `500` | Ms to hold the scan button before `onScanButtonLongPress` triggers. |

### Scan detection

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `minLength` | `number` | `6` | Minimum accepted scan length. Shorter strings trigger `onScanError`. |
| `suffixKeyCodes` | `number[]` | `[9, 13]` | Key codes that mark the END of a scan (Tab, Enter). These events are silenced. |
| `prefixKeyCodes` | `number[]` | `[]` | Key codes that mark the START of a scan. These events are silenced. |
| `scanButtonKeyCode` | `number \| false` | `false` | Key code of the scanner's own hardware button. Set to avoid treating button presses as scan characters. |
| `singleScanQty` | `number` | `1` | Quantity value passed with each successful scan. |

### Behaviour

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `reactToKeydown` | `boolean` | `true` | Listen for `keydown` events (keyboard-mode scanners). |
| `reactToPaste` | `boolean` | `false` | Listen for `paste` events (clipboard-mode scanners). |
| `ignoreIfFocusOn` | `false \| string \| string[]` | `false` | CSS selector(s); scans are ignored when any matching element is focused. |
| `stopPropagation` | `boolean` | `false` | Call `stopImmediatePropagation()` on processed key events. ⚠ Can break keyboard typing. |
| `preventDefault` | `boolean` | `false` | Call `preventDefault()` on processed key events. ⚠ Can break keyboard typing. |
| `captureEvents` | `boolean` | `false` | Register listeners in capture phase so onScan receives events before any child element. |

---

## 5. Methods Reference

All methods are chainable (they return the `onScan` singleton) unless noted.

```ts
import onScan from 'onscan.js';
import type { OnScanElement, OnScanOptions, SimulateInput } from 'onscan.js';
```

### `attachTo(element, options?)`

```ts
onScan.attachTo(element: OnScanElement, options?: Partial<OnScanOptions>): typeof onScan
```

Starts listening on `element`. Use `document as unknown as OnScanElement` to listen
globally. Throws if `attachTo` is called twice on the same element without
`detachFrom` in between.

### `detachFrom(element)`

```ts
onScan.detachFrom(element: OnScanElement): void
```

Removes all listeners and clears internal state. Safe to call even if already detached.

### `getOptions(element)`

```ts
onScan.getOptions(element: OnScanElement): OnScanOptions
```

Returns the full, merged options object currently active for `element`.

### `setOptions(element, options)`

```ts
onScan.setOptions(element: OnScanElement, options: Partial<OnScanOptions>): typeof onScan
```

Merges `options` into the current options for `element`. Listeners are added/removed
automatically when `reactToPaste` or `scanButtonKeyCode` change.

### `simulate(element, input)`

```ts
onScan.simulate(element: OnScanElement, input: SimulateInput): typeof onScan
```

Programmatically fires a scan. See [Simulating Scans](#8-simulating-scans).

### `decodeKeyEvent(event)`

```ts
onScan.decodeKeyEvent(event: KeyboardEvent): string | number
```

The default key-code decoder. Returns the character for key codes 48–111,
or an empty string for all others.

### `isAttachedTo(element)`

```ts
onScan.isAttachedTo(element: OnScanElement): boolean
```

Returns `true` when onScan is currently attached to `element`.

### `isScanInProgressFor(element)`

```ts
onScan.isScanInProgressFor(element: OnScanElement): boolean
```

Returns `true` when a scan sequence has started but not yet ended.
Useful inside event callbacks.

---

## 6. Events Reference

onScan fires [CustomEvent](https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent)
instances on the element it is attached to.

| Event name | `event.detail` type | Description |
|------------|---------------------|-------------|
| `scan` | `ScanEventDetail` | Fired after a successful scan. |
| `scanError` | `ScanError` | Fired when a scan is rejected. |
| `scanButtonLongPress` | *(none)* | Fired when the hardware button is held long enough. |

Listen via `addEventListener`:

```ts
import type { ScanEventDetail, ScanError } from 'onscan.js';

document.addEventListener('scan', (e) => {
  const detail = (e as CustomEvent<ScanEventDetail>).detail;
  console.log(detail.scanCode, detail.qty);
});

document.addEventListener('scanError', (e) => {
  const detail = (e as CustomEvent<ScanError>).detail;
  console.warn(detail.message, detail.scanCode);
});
```

---

## 7. Decoding Key Codes

By default onScan decodes these key-code ranges:

| Range | Meaning |
|-------|---------|
| 48–90 | Letters and regular numbers |
| 96–105 | Numeric keypad 0–9 (returned as `number`) |
| 106–111 | Numeric keypad operators (+, -, \*, /, etc.) |

All other codes produce an empty string and are ignored.

### Custom `keyCodeMapper`

```ts
import onScan from 'onscan.js';
import type { OnScanElement } from 'onscan.js';

const target = document as unknown as OnScanElement;

onScan.attachTo(target, {
  keyCodeMapper(event: KeyboardEvent): string | number | null {
    // Handle a scanner-specific virtual key code
    if (event.keyCode === 192) return '-';

    // Fall back to the built-in decoder for everything else
    return onScan.decodeKeyEvent(event);
  },
  onScan(scanCode) {
    console.log('Decoded:', scanCode);
  },
});
```

---

## 8. Simulating Scans

Use `simulate()` in tests or demos when a physical scanner is not available.

```ts
import onScan from 'onscan.js';
import type { OnScanElement, SimulateInput } from 'onscan.js';

const target = document as unknown as OnScanElement;
onScan.attachTo(target);

// 1. Plain string – skips key-code decoding, goes straight to validation
onScan.simulate(target, '1234567890123');

// 2. Array of key codes – synthetic keydown events, empty `key` property
const keyCodes: SimulateInput = [49, 50, 51, 52, 53, 54];
onScan.simulate(target, keyCodes);

// 3. Array of KeyboardEventInit objects – full control over every event property
const events: SimulateInput = [
  { keyCode: 80, key: 'P', shiftKey: true },
  { keyCode: 49, key: '1' },
  { keyCode: 50, key: '2' },
  { keyCode: 51, key: '3' },
  { keyCode: 52, key: '4' },
  { keyCode: 53, key: '5' },
];
onScan.simulate(target, events);
```

---

## 9. Framework Integration

### 9.1 React (Hook)

```tsx
// hooks/useOnScan.ts
import { useEffect } from 'react';
import onScan from 'onscan.js';
import type { OnScanElement, OnScanOptions } from 'onscan.js';

export function useOnScan(
  options: Partial<OnScanOptions>,
  element: Element | Document = document
): void {
  useEffect(() => {
    const target = element as unknown as OnScanElement;
    onScan.attachTo(target, options);
    return () => {
      onScan.detachFrom(target);
    };
    // Re-attach whenever options change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [element]);
}
```

```tsx
// components/BarcodeScanner.tsx
import React, { useCallback } from 'react';
import { useOnScan } from '../hooks/useOnScan';

export function BarcodeScanner() {
  const handleScan = useCallback((scanCode: string, qty: number) => {
    console.log(`Scanned ${qty}× ${scanCode}`);
  }, []);

  useOnScan({
    suffixKeyCodes: [13],
    onScan: handleScan,
  });

  return <div>Ready to scan…</div>;
}
```

---

### 9.2 Angular (Service)

```ts
// barcode-scanner.service.ts
import { Injectable, OnDestroy } from '@angular/core';
import onScan from 'onscan.js';
import type { OnScanElement, OnScanOptions, ScanEventDetail } from 'onscan.js';
import { Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class BarcodeScannerService implements OnDestroy {
  private readonly scan$ = new Subject<ScanEventDetail>();
  readonly scans$ = this.scan$.asObservable();

  private target: OnScanElement | null = null;

  init(options: Partial<OnScanOptions> = {}): void {
    this.target = document as unknown as OnScanElement;

    onScan.attachTo(this.target, {
      suffixKeyCodes: [13],
      ...options,
      onScan: (scanCode, qty) => {
        this.scan$.next({ scanCode, qty });
        options.onScan?.call(document, scanCode, qty);
      },
    });
  }

  destroy(): void {
    if (this.target) {
      onScan.detachFrom(this.target);
      this.target = null;
    }
  }

  ngOnDestroy(): void {
    this.destroy();
  }
}
```

```ts
// app.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { BarcodeScannerService } from './barcode-scanner.service';
import { Subscription } from 'rxjs';

@Component({ selector: 'app-root', template: '<router-outlet />' })
export class AppComponent implements OnInit, OnDestroy {
  private sub!: Subscription;

  constructor(private scanner: BarcodeScannerService) {}

  ngOnInit(): void {
    this.scanner.init();
    this.sub = this.scanner.scans$.subscribe(({ scanCode, qty }) => {
      console.log(`${qty}× ${scanCode}`);
    });
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
    this.scanner.destroy();
  }
}
```

---

### 9.3 Vue 3 (Composable)

```ts
// composables/useOnScan.ts
import { onMounted, onUnmounted } from 'vue';
import onScan from 'onscan.js';
import type { OnScanElement, OnScanOptions } from 'onscan.js';

export function useOnScan(
  options: Partial<OnScanOptions>,
  getElement: () => Element | Document = () => document
): void {
  let target: OnScanElement | null = null;

  onMounted(() => {
    target = getElement() as unknown as OnScanElement;
    onScan.attachTo(target, options);
  });

  onUnmounted(() => {
    if (target) {
      onScan.detachFrom(target);
    }
  });
}
```

```vue
<!-- ScannerView.vue -->
<script setup lang="ts">
import { useOnScan } from '../composables/useOnScan';

useOnScan({
  suffixKeyCodes: [13],
  onScan(scanCode, qty) {
    console.log(`${qty}× ${scanCode}`);
  },
});
</script>

<template>
  <div>Ready to scan…</div>
</template>
```

---

### 9.4 Next.js

onScan.js relies on browser APIs (`document`, `window`, `KeyboardEvent`).
**It must only run client-side.**

```tsx
// hooks/useOnScan.ts  (same as the React hook above – works in Next.js too)
import { useEffect } from 'react';
import type { OnScanOptions } from 'onscan.js';

export function useOnScan(options: Partial<OnScanOptions>): void {
  useEffect(() => {
    // Dynamic import so onScan is never bundled into the server entry
    let cleanup: (() => void) | undefined;

    import('onscan.js').then(({ default: onScan }) => {
      const target = document as unknown as import('onscan.js').OnScanElement;
      onScan.attachTo(target, options);
      cleanup = () => onScan.detachFrom(target);
    });

    return () => cleanup?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
```

```tsx
// app/scanner/page.tsx  (App Router)
'use client';

import { useOnScan } from '../../hooks/useOnScan';

export default function ScannerPage() {
  useOnScan({
    suffixKeyCodes: [13],
    onScan(scanCode, qty) {
      console.log(`${qty}× ${scanCode}`);
    },
  });

  return <main>Ready to scan…</main>;
}
```

> **Tip:** The `'use client'` directive is required. Never call `onScan.attachTo`
> inside a Server Component.

---

### 9.5 Nuxt 3

```ts
// plugins/onscan.client.ts
// The `.client.ts` suffix guarantees Nuxt only loads this on the client.
import onScan from 'onscan.js';
import type { OnScanElement } from 'onscan.js';

export default defineNuxtPlugin(() => {
  const target = document as unknown as OnScanElement;

  onScan.attachTo(target, {
    suffixKeyCodes: [13],
    onScan(scanCode, qty) {
      console.log(`${qty}× ${scanCode}`);
    },
  });
});
```

Or use a composable for per-page / per-component lifecycle management:

```ts
// composables/useOnScan.ts  (identical to the Vue 3 example above)
```

```vue
<!-- pages/scanner.vue -->
<script setup lang="ts">
import { useOnScan } from '~/composables/useOnScan';

useOnScan({
  suffixKeyCodes: [13],
  onScan(scanCode, qty) {
    console.log(`${qty}× ${scanCode}`);
  },
});
</script>

<template>
  <div>Ready to scan…</div>
</template>
```

---

## 10. Typing DOM Events

When you need to pass a DOM element (rather than `document`) to onScan,
cast it to `OnScanElement`:

```ts
import type { OnScanElement } from 'onscan.js';

const divEl = document.getElementById('scan-zone');
if (divEl) {
  const target = divEl as unknown as OnScanElement;
  onScan.attachTo(target, { /* options */ });
}
```

The double cast (`as unknown as OnScanElement`) is necessary because
`HTMLDivElement` does not declare `scannerDetectionData` – that property
is added dynamically at runtime.

---

## 11. Listening to Typed Custom Events

The `scan` and `scanError` events are standard DOM `CustomEvent`s.
TypeScript types them as `Event` by default; cast the event argument
to access the typed `detail` property:

```ts
import type { ScanEventDetail, ScanError } from 'onscan.js';

// Successful scan
document.addEventListener('scan', (rawEvent: Event) => {
  const e = rawEvent as CustomEvent<ScanEventDetail>;
  console.log('Code:', e.detail.scanCode);
  console.log('Qty:', e.detail.qty);
});

// Failed / rejected scan
document.addEventListener('scanError', (rawEvent: Event) => {
  const e = rawEvent as CustomEvent<ScanError>;
  console.warn('Rejected:', e.detail.message);
  console.warn('Code was:', e.detail.scanCode);
  console.warn('Duration:', e.detail.scanDuration, 'ms');
});
```

You can also augment `GlobalEventHandlersEventMap` once globally to make
TypeScript aware of these event names:

```ts
// global.d.ts
import type { ScanEventDetail, ScanError } from 'onscan.js';

declare global {
  interface GlobalEventHandlersEventMap {
    scan: CustomEvent<ScanEventDetail>;
    scanError: CustomEvent<ScanError>;
    scanButtonLongPress: CustomEvent<void>;
  }
}
```

After adding this declaration, you get full type inference without any casts:

```ts
document.addEventListener('scan', (e) => {
  // e is now typed as CustomEvent<ScanEventDetail> automatically
  console.log(e.detail.scanCode);
});
```
