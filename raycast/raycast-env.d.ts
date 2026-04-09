/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `hostly-core` command */
  export type HostlyCore = ExtensionPreferences & {
  /** Hostly Binary Path - Optional override. Defaults to /Applications/Hostly.app/Contents/MacOS/hostly-core */
  "hostlyPath"?: string
}
}

declare namespace Arguments {
  /** Arguments passed to the `hostly-core` command */
  export type HostlyCore = {}
}

