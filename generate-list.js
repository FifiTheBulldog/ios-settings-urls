"use strict";

// I do solemnly swear that I have never been high in my life.
// Not even when writing this god-awful code.
// Maybe someday I'll have the courage to refactor it so that it makes sense.

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
  > UNUserNotifiactionCenter.UNDefaultCategories[1].UNCategoryActiions[0].UNActionURL
    property is a URL that may or may not work:
      prefs:root=NOTIFICATIONS_ID#CMAS_GROUP
- Anything in dyld_shared_cache (which has a few more useful URLs), including placeholders

Output:
- Markdown list (English only?)
- JSON for each localization
- JSON containing all URLs
- JSON (English only) formatted for alombi's site (for now)
*/

const fs = require("fs");
const { basename, extname, join, resolve } = require("path");
const plist = require("simple-plist");

const ROOT_STR = "(root)";
const SSM = "SettingsSearchManifest";
const OVERRIDES_PATH = resolve(".", "overrides.json");

/**
 * Path to the iOS simulator in Xcode on macOS.
 */
const SIM_PATH = join(
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
  "Resources"
);

// Theoretically we could go through all of /System/Library or even
// the entire filesystem, but that would take a very long time with
// almost no gains.
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

let mainPath = join("/", "System", "Library");

const overrides = require(OVERRIDES_PATH);
let iosVersion = "";

switch (process.platform) {
  case "darwin":
    // Could be jailbroken or using a-Shell on iOS, or running on macOS
    break;
  case "linux":
    // Assume iSH on iOS
    require("child_process").execFileSync("mount", ["-t", "real", "/", "/mnt"]);
    mainPath = join("/", "mnt", mainPath);
    break;
  default:
    throw new Error("Unsupported platform: " + process.platform);
}

// Adjust the /System/Library/ path to point to the iOS simulator's filesystem
// on macOS, and determine the iOS version
/**
 * Information about the system from SystemVersion.plist, particularly the platform name and version.
 * @type {Object.<string, string>}
 */
const systemVersion = plist.readFileSync(join(mainPath, "CoreServices", "SystemVersion.plist"));
switch (systemVersion.ProductName) {
  case "Mac OS X":
  case "macOS":
    mainPath = join(SIM_PATH, "RuntimeRoot", mainPath);
    iosVersion = plist.readFileSync(join(SIM_PATH, "profile.plist")).defaultVersionString;
    break;
  case "iPhone OS":
    iosVersion = systemVersion.ProductVersion;
    break;
  default:
    throw new Error("Unsupported platform: " + process.platform);
}

/**
 * Strings to localize all of the Settings URLs.
 * 
 * Structure:
 * {
 *   LOCALE_NAME: {
 *     FILE_ID: {
 *       LABEL_NAME: STRING
 *     }
 *   }
 * }
 * @type {Object.<string, Object.<string, Object.<string, string>>>}
 */
const locales = {};

/**
 * URL items read from manifests.
 * @type {UrlItem[]}
 */
const urlItems = [];

/**
 * Removes the extension from a file path.
 * @param {string} pathName The file path.
 * @returns {string} The file path without its extension.
 */
const removeExtension = (pathName) => pathName.substring(0, pathName.lastIndexOf(".")) || pathName;

/**
 * Synchronously reads the contents of a directory.
 * @param {string} path The path to the directory.
 * @returns {fs.Dirent[]} The items in the directory.
 */
const readDirectory = (path) => fs.readdirSync(path, {
  withFileTypes: true,
  encoding: "utf-8"
});

/**
 * An object containing all of the relevant data for a URL dumped from a SettingsSearchManifest.
 */
class UrlItem {
  /**
   * 
   * @param {Object.<string, string>} item An item from a SettingsSearchManifest to parse.
   * @param {string} manifestPath The full path to the SettingsSearchManifest file.
   */
  constructor(item, manifestPath) {
    this.label = item.label;
    this.url = item.searchURL;
    const settingsUrl = new URL(item.searchURL);
    const params = new URLSearchParams(settingsUrl.pathname);
    this.id = removeExtension(manifestPath);
    this.pathComponents = [settingsUrl.protocol, params.get("root")];
    const urlPath = params.get("path");
    if (urlPath) {
      for (const pathPiece of urlPath.split("/")) {
        this.pathComponents.push(pathPiece);
      }
    }
    if (settingsUrl.hash) {
      this.pathComponents.push(settingsUrl.hash);
    }
  }
}

/**
 * Reads the items from a SettingsSearchManifest file and add them to the global array of URL entries.
 * @param {string} manifestPath The path to the SettingsSearchManifest file.
 */
const readManifest = (manifestPath) => {
  for (const item of plist.readFileSync(manifestPath).items) {
    urlItems.push(new UrlItem(item, manifestPath));
  }
}

/**
 * Reads the contents of a .lproj directory and add the entries to the global dictionary of locales.
 * @param {string} lprojPath The path to the .lproj directory.
 */
const scanLproj = (lprojPath) => {
  const localeName = removeExtension(basename(lprojPath));
  if (!(localeName in locales)) {
    locales[localeName] = {};
  }
  for (const f of readDirectory(lprojPath)) {
    if (!f.isDirectory() && f.name.startsWith(SSM) && extname(f.name) === ".strings") {
      // item is a .strings file
      let fileId = resolve(lprojPath, "..", removeExtension(f.name));
      locales[localeName][fileId] = plist.readFileSync(join(lprojPath, f.name));
    }
  }
}

/**
 * Scans a bundle directory for Settings URLs.
 * @param {string} bundlePath The path of the bundle.
 */
const scanBundle = (bundlePath) => {
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
 * Scans a directory for Settings URLs.
 * @param {string} dirPath The name of the directory to scan.
 */
const scanDir = (dirPath) => {
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

// Dump all the URLs and localized labels into `locales` and `urlItems`
for (const name of DIRS) {
  scanDir(join(mainPath, name));
}
scanBundle(join(mainPath, "PrivateFrameworks", "PBBridgeSupport.framework"));

// Add in overrides
// URL items
for (const item of overrides.items) {
  urlItems.push(new UrlItem(item, OVERRIDES_PATH));
}

// Strings
for (const labelId in overrides.strings) {
  const labelItem = overrides.strings[labelId];
  for (const localeName in labelItem) {
    if (!locales[localeName][OVERRIDES_PATH]) {
      locales[localeName][OVERRIDES_PATH] = {};
    }
    locales[localeName][OVERRIDES_PATH] = labelItem[localeName];
  }
}

// Sort the URLs into a template list that can then be used to create localized
// JSON and possibly Markdown lists. This list shall have a similar structure
// to what's in the localized versions, but with different keys and a lot more
// data about each URL.

/**
 * Adds a UrlItem to the master dictionary.
 * @param {UrlItem} urlItem The URL item to insert into the master dictionary of URLs.
 * @param {Object.<string, object>} urlsObj The master dictionary of URLs, or a subdictionary of the master dictionary.
 * @param {number=} pathIndex The index of urlItem's path components to check.
 */
const addUrlItemToMasterDict = (urlItem, urlsObj, pathIndex = 0) => {
  const urlKey = urlItem.pathComponents[pathIndex];
  if (pathIndex === urlItem.pathComponents.length - 1) {
    // This is the last item in the path, no need for further checks
    if (urlKey in urlsObj) {
      urlsObj[urlKey].rootItem = urlItem;
    } else {
      urlsObj[urlKey] = urlItem;
    }
    return;
  }
  // We can now assume that this is not the last component of the URL path.
  // No need to determine whether it's the last path component or not.
  if (urlKey in urlsObj) {
    const rootUrlItem = urlsObj[urlKey];
    if (rootUrlItem instanceof UrlItem) {
      urlsObj[urlKey] = {
        rootItem: rootUrlItem,
        children: {}
      };
    }
  } else {
    urlsObj[urlKey] = {
      children: {}
    };
  }
  addUrlItemToMasterDict(urlItem, urlsObj[urlKey].children, pathIndex + 1);
}

const urlsMasterDict = {};
for (const urlItem of urlItems) {
  addUrlItemToMasterDict(urlItem, urlsMasterDict);
}
/**/
const defaultLocale = "en";
let locale;

const getLocaleItem = (fileId, labelName) => {
  return locales?.[locale]?.[fileId]?.[labelName]
         ?? locales?.[defaultLocale]?.[fileId]?.[labelName];
}

/**
 * Builds a localized object of URL items (for distribution).
 * @param {UrlItem|object} obj Object to use as the master dictionary.
 */
const buildLocalizedObject = (item) => {
  const result = {};
  for (const [key, child] of Object.entries(item)) {
    if (child instanceof UrlItem) {
      result[getLocaleItem(child.id, child.label)] = child.url;
    } else {
      const { rootItem } = child;
      const deeperResult = {};
      if (rootItem) {
        deeperResult[ROOT_STR] = rootItem.url;
        result[getLocaleItem(rootItem?.id, rootItem?.label)] = deeperResult;
      } else {
        console.log(child);
        throw new Error("Manual addition needed");
      }
      Object.assign(deeperResult, buildLocalizedObject(child.children));
    }
  }
  return result;
};

const schemes = {
  "prefs:": "Settings",
  "bridge:": "Watch"
};
/* *
for (const scheme in urlsMasterDict) {
  const localizedSubJson = {};
  for (const sectionRoot in urlsMasterDict[scheme].children) {
    const section = urlsMasterDict[scheme].children[sectionRoot];
    const [name, result] = buildLocalizedObject(section, section?.rootItem?.id);
    localizedSubJson[name] = result;
  }
  fs.writeFile(scheme.replace(":", "") + ".json", JSON.stringify(localizedSubJson, null, 2), {encoding: "utf-8"});
}

/* ===== ALL MAIN CODE GOES ABOVE THIS LINE ===== */
/* ===== TEST COMPONENTS BELOW THIS LINE ===== */



console.log(buildLocalizedObject(urlsMasterDict["prefs:"].children))
console.log(Object.keys(locales))
//console.log(urlItems.filter(u => u.url.includes( "prefs:root=APPLE_ACCOUNT")))