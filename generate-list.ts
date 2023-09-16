/*
Locations in /System/Library/ to check:
- PreferenceBundles: only two of the bundles seem to actually contain
  a SettingsSearchManifest.plist, but make sure to scan the entire
  directory and examine all subfolders that aren't .lproj or .bundle
  (excluding _CodeSignature) for .bundle directories.
- PreferenceManifests: Just one big bundle, AppleAccountSettingsSearch.bundle.
- PreferenceManifestsInternal: Two bundles, AccessibilitySettingsSearch.bundle
  for accessibility settings and PreferenceManifests.bundle for
  everything else.
- BridgeManifests: for Watch URLs.

Other locations to check:
- NanoPreferenceBundles (contains subfolders, like Applications, to scan as dirs)
- UserNotifications/Bundles/com.apple.cmas.bundle/Info.plist
- PrivateFrameworks/PBBridgeSupport.framework/SettingsSearchManifest.plist

Can't realistically scan without a considerable amount of additional logic:
- /System/Library/UserNotifications/Bundles/com.apple.cmas.bundle/Info.plist
  > UNUserNotificationCenter.UNDefaultCategories[1].UNCategoryActions[0].UNActionURL
    property is a URL that may or may not work:
      prefs:root=NOTIFICATIONS_ID#CMAS_GROUP
- Anything in dyld_shared_cache (which has a few more useful URLs), including placeholders

Theoretically we could go through all of /System/Library or even the entire filesystem,
but that would take a very long time with almost no gains.

Output:
- For each locale:
  - For each scheme:
    - Localized JSON
    - Localized Markdown list
- List of URLs that need manual overrides
- Copy versions/<number>/en/prefs.json and prefs.md to root as settings-urls.json and settings-urls.md
*/

import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, WriteStream, type Dirent } from "fs";
import { basename, extname, join, resolve } from "path";
import plist from "simple-plist";
import { execFileSync } from "child_process";

// Constants
/**
 * Directories in /System/Library/ to scan for Settings URLs.
 */
const DIRS = [
  "BridgeManifests",
  "NanoPreferenceBundles",
  "PreferenceBundles",
  "PreferenceManifests",
  "PreferenceManifestsInternal"
];
const ROOT_STR = "(root)";
const SSM = "SettingsSearchManifest";
const OVERRIDES_PATH = resolve(".", "overrides.json");
const OVERRIDES_LOCALES_KEY = OVERRIDES_PATH.slice(0, OVERRIDES_PATH.lastIndexOf("."));
const DEFAULT_LOCALE = "en";

// Collections for handling URLs
const overrides: Array<{
  url: string;
  label: {
    [locale: string]: string;
  };
}> = JSON.parse(readFileSync(OVERRIDES_PATH, { encoding: "utf-8" }));

/**
 * Master map of URL items, sorted into a tree for convenient conversion into a user-friendly JSON.
 */
const urlsMasterMap: UrlsMap = new Map();

/**
 * Strings to localize all of the Settings URLs.
 * 
 * Structure:
 * ```
 * Map {
 *   [LOCALE_NAME: string] => {
 *     [FILE_ID: string] => {
 *       [LABEL_NAME: string]: string
 *     }
 *   }
 * }
 * ```
 */
const locales = new Map<string, Map<string, Record<string, string>>>();

const overrideChildren = new Set<string>();

// Types
/**
 * Item in a SettingsSearchManifest plist file.
 * @remarks This type is incomplete, but we don't need more than these properties.
 */
interface SettingsSearchManifestItem {
  label: string;
  searchURL: string;
}

/**
 * Entry in a UrlsMap with a root item and children.
 */
interface UrlsMapEntry {
  rootItem?: UrlItem;
  children: UrlsMap;
}

/**
 * Structure of the master dictionary of URLs
 */
type UrlsMap = Map<string, UrlItem | UrlsMapEntry>;

/**
 * Entry in the final dictionary that is written to the file system.
 */
interface OutputEntry {
  [label: string]: string | OutputEntry;
}

/**
 * Path to `/System/Library/`.
 */
let mainPath: string;

/**
 * Read the contents of SystemVersion.plist.
 * @returns SystemVersion.plist contents
 * @remarks This exists to avoid repetition, since this will be called again if platform is macOS
 */
const readSystemVersion = () => plist.readFileSync<{
  ProductName: string,
  ProductVersion: string
}>(join(mainPath, "CoreServices", "SystemVersion.plist"));

/**
 * Removes the extension from a file path.
 * @param pathName File path.
 * @returns File path without its extension.
 */
const removeExtension = (pathName: string): string => pathName.substring(0, pathName.lastIndexOf(".")) || pathName;

/**
 * Synchronously reads the contents of a directory.
 * @param path Path to the directory.
 * @returns Items in the directory.
 */
const readDirectory = (path: string): Dirent[] => readdirSync(path, {
  withFileTypes: true,
  encoding: "utf-8"
});

/**
 * An object containing all of the relevant data for a URL dumped from a SettingsSearchManifest.
 */
class UrlItem {
  public readonly label: string;
  public readonly url: string;
  public readonly id: string;
  public readonly pathComponents: string[];

  /**
   * Constructs a new UrlItem.
   * @param item An item from a SettingsSearchManifest to parse.
   * @param manifestPath Full path to the SettingsSearchManifest file.
   */
  public constructor(item: SettingsSearchManifestItem, manifestPath: string) {
    this.label = item.label;
    this.url = item.searchURL;
    const settingsUrl = new URL(item.searchURL);
    const params = new URLSearchParams(settingsUrl.pathname);
    this.id = removeExtension(manifestPath);
    this.pathComponents = [settingsUrl.protocol, params.get("root")!];
    const urlPath = params.get("path");
    if (urlPath) {
      this.pathComponents.push(...urlPath.split("/"));
    }
    if (settingsUrl.hash) {
      this.pathComponents.push(settingsUrl.hash);
    }
  }
}

let totalUrls = 0;

/**
 * Adds a UrlItem to the master map.
 * @param urlItem The URL item to insert into the master map of URLs.
 * @param urlsMap The master map of URLs, or a sub-map of the master map.
 * @param pathIndex The index of urlItem's path components to check.
 */
 const addItemToMaster = (urlItem: UrlItem, urlsMap: UrlsMap, pathIndex = 0): void => {
  const urlKey = urlItem.pathComponents[pathIndex];
  if (pathIndex === urlItem.pathComponents.length - 1) {
    ++totalUrls;
    // The current level of the map is the destination for this UrlItem
    if (urlsMap.has(urlKey)) {
      // Can't be a UrlItem, since these URLs are unique
      (urlsMap.get(urlKey)! as UrlsMapEntry).rootItem = urlItem;
    } else {
      // Completely unknown key so far
      urlsMap.set(urlKey, urlItem);
    }
  } else {
    let nextLevel = urlsMap.get(urlKey);
    if (nextLevel && nextLevel instanceof UrlItem) {
      urlsMap.set(urlKey, (nextLevel = {
        rootItem: nextLevel,
        children: new Map()
      }));
    } else {
      nextLevel ?? urlsMap.set(urlKey, (nextLevel = {
        rootItem: undefined,
        children: new Map()
      }));
    }
    
    addItemToMaster(urlItem, nextLevel.children, pathIndex + 1);
  }
}

/**
 * Reads the items from a SettingsSearchManifest file and add them to the global array of URL entries.
 * @param manifestPath Path to the SettingsSearchManifest file.
 */
const readManifest = (manifestPath: string): void => {
  for (const item of plist.readFileSync<{ items: SettingsSearchManifestItem[] }>(manifestPath).items) {
    addItemToMaster(new UrlItem(item, manifestPath), urlsMasterMap);
  }
}

/**
 * Reads the contents of a .lproj directory and adds the entries to the global dictionary of locales.
 * @param lprojPath Path to the .lproj directory.
 */
const scanLproj = (lprojPath: string): void => {
  const localeName = removeExtension(basename(lprojPath));
  if (!locales.has(localeName)) {
    locales.set(localeName, new Map())
  }
  const localeMap = locales.get(localeName)!;
  if (!locales.has(localeName)) {
    locales.set(localeName, new Map());
  }

  for (const f of readDirectory(lprojPath)) {
    if (!f.isDirectory() && f.name.startsWith(SSM) && extname(f.name) === ".strings") {
      // item is a .strings file
      localeMap.set(
        // Associated SettingsSearchManifest.plist path w/o file extension
        resolve(lprojPath, "..", removeExtension(f.name)),
        plist.readFileSync(join(lprojPath, f.name))
      );
    }
  }
}

/**
 * Scans a bundle directory for Settings URLs.
 * @param bundlePath Path of the bundle.
 */
const scanBundle = (bundlePath: string): void => {
  for (const f of readDirectory(bundlePath)) {
    const fullPath = join(bundlePath, f.name);
    if (f.isDirectory() && extname(f.name) === ".lproj") {
      scanLproj(fullPath); // f is a .lproj folder (contains localizations)
    } else if (f.name.startsWith(SSM) && extname(f.name) === ".plist") {
      readManifest(fullPath); // f is a manifest (contains URLs)
    }
  }
}

/**
 * Recursively scans a directory for bundles containing Settings URLs.
 * @param dirPath Name of the directory to scan.
 */
const scanDir = (dirPath: string): void => {
  for (const f of readDirectory(dirPath)) {
    if (f.isDirectory()) {
      const fullSubDirPath = join(dirPath, f.name);
      if (extname(f.name) === ".bundle") {
        scanBundle(fullSubDirPath);
      } else if (f.name !== "_CodeSignature") {
        scanDir(fullSubDirPath);
      }
    }
  }
}

const getLocaleItem = (fileId: string, labelName: string, locale: string): string => {
  return locales.get(locale)!.get(fileId)?.[labelName]
         ?? locales.get(DEFAULT_LOCALE)!.get(fileId)![labelName];
}

const addUrlToResult = (result: OutputEntry, key: string, value: string | OutputEntry): void => {
  const existing = result[key];
  if (typeof existing !== "object") {
    result[key] = value;
  }
}

let needsOverrideIndex = 0;

/**
 * Converts an entry in the master URLs map to a JSON-serializable object for distribution.
 * @param entry Entry in the master URLs map to convert to a localized object.
 * @param locale Locale code to use for building the localized object.
 * @returns Localized object.
 */
const buildLocalizedObject = (entry: UrlsMapEntry, locale: string): OutputEntry => {
  const result: OutputEntry = {};
  if (entry.rootItem) {
    result[ROOT_STR] = entry.rootItem.url;
  }
  for (const value of entry.children.values()) {
    if (value instanceof UrlItem) {
      // Only add if key is not already present in dictionary
      // This way, in-page navigation never overrides a page with submenus
      addUrlToResult(result, getLocaleItem(value.id, value.label, locale), value.url);
    } else {
      let key: string;
      if (value.rootItem) {
        key = getLocaleItem(value.rootItem.id, value.rootItem.label, locale);
      } else {
        key = `NEEDS_OVERRIDE_${needsOverrideIndex++}`;
        overrideChildren.add(value.children.entries().next().value[1].url);
      }
      addUrlToResult(result, key, buildLocalizedObject(value, locale));
    }
  }
  return result;
};

/**
 * Converts a localized output dictionary to a .md file and writes it to a file.
 * @param json Localized output dictionary
 * @param stream Stream to write lines to the resulting .md file.
 * @param prefix Prefix for each line of the written markdown
 */
const jsonToMd = (json: OutputEntry, stream: WriteStream, prefix?: string): void => {
  for (const [key, value] of Object.entries(json)) {
    const newPrefix = `${prefix || "- "}${key === ROOT_STR ? "" : `${prefix ? " → " : ""}${key}`}`;
    if (typeof value === "string") {
      stream.write(`${newPrefix}: \`${value}\`\n`);
    } else {
      jsonToMd(value, stream, newPrefix);
    }
  }
}

mainPath = join("/", "System", "Library");

switch (process.platform) {
  case "darwin":
    // macOS or jailbroken iOS
    break;
  case "linux":
    // Assume iSH on iOS
    execFileSync("mount", ["-t", "real", "/", "/mnt"]);
    mainPath = join("/", "mnt", mainPath);
    break;
  default:
    throw new Error("Unsupported platform: " + process.platform);
}

/**
 * Information about the system from SystemVersion.plist, particularly the platform name and version.
 */
let systemVersion = readSystemVersion();

switch (systemVersion.ProductName) {
  case "Mac OS X":
  case "macOS":
    // Adjust the path for /System/Library/ to point to the iOS simulator's filesystem
    mainPath = join(
      "/",
      "Applications",
      "Xcode.app",
      "Contents",
      "Developer",
      "Platforms",
      "iPhoneOS.platform",
      "Library",
      "Developer",
      "CoreSimulator",
      "Profiles",
      "Runtimes",
      "iOS.simruntime",
      "Contents",
      "Resources",
      "RuntimeRoot",
      mainPath
    );
    systemVersion = readSystemVersion();
  case "iPhone OS":
    break;
  default:
    throw new Error("Unsupported platform: " + process.platform);
}

// Dump all the URLs and localized labels into `locales` and `urlsMasterMap`
for (const name of DIRS) {
  scanDir(join(mainPath, name));
}
scanBundle(join(mainPath, "PrivateFrameworks", "PBBridgeSupport.framework"));

// Add in overrides
overrides.forEach((item, i) => {
  const labelId = String(i);
  addItemToMaster(new UrlItem({ searchURL: item.url, label: labelId }, OVERRIDES_PATH), urlsMasterMap);
  for (const locale of Object.keys(item.label)) {
    const localeMap = locales.get(locale)!;
    if (!localeMap.has(OVERRIDES_LOCALES_KEY)) {
      localeMap.set(OVERRIDES_LOCALES_KEY, {});
    }
    localeMap.get(OVERRIDES_LOCALES_KEY)![labelId] = item.label[locale];
  }
});

// Create folder for versions if it doesn't exist
const versionsPath = join(".", "versions");
if (!existsSync(versionsPath)) {
  mkdirSync(versionsPath);
}

// Create folder for this iOS version if it doesn't exist
const versionPath = join(versionsPath, systemVersion.ProductVersion);
if (!existsSync(versionPath)) {
  mkdirSync(versionPath);
}

// Create output files for each locale
for (const locale of locales.keys()) {
  const localePath = join(versionPath, locale);
  if (!existsSync(localePath)) {
    mkdirSync(localePath);
  }
  for (const [scheme, dict] of urlsMasterMap.entries()) {
    const schemeName = scheme.slice(0, -1);
    const result = buildLocalizedObject(dict as UrlsMapEntry, locale);
    writeFileSync(join(localePath, `${schemeName}.json`), JSON.stringify(result, undefined, 2))
    const mdStream = createWriteStream(join(localePath, `${schemeName}.md`));
    jsonToMd(result, mdStream);
    mdStream.end();
  }
}

// Alert user to URLs that need manual overrides to be added in overrides.json
if (overrideChildren.size) {
  const needOverridesPath = join(versionPath, "needOverrides.txt");
  console.warn(`${overrideChildren.size} URLs need manual overrides. See ${needOverridesPath} for the list.`);
  const needOverridesStream = createWriteStream(needOverridesPath);
  for (const url of overrideChildren) {
    needOverridesStream.write(url + "\n");
  }
  needOverridesStream.end();
}