/*
Locations in /System/Library/ to check:
- PreferenceBundles: only two of the bundles seem to actually ontain
  a SettingsSearchManifest.plist, but make sure to scan the entire
  directory and examine all subfolders that aren't .lproj or .bundle
  (excluding _CodeSignature) for .bundle directories.
- PreferenceManifests: Just one big bundle, AppleAccountSettingsSearch.bundle.
- PreferenceManifestsInternal: Two bundles, AccessibilitySettingsSearch.bundle
  for accessibility settings and PreferenceManifests.bundle for
  everything else.
*/

const mainPath = "/System/Library";

const { join } = require("path");

const { readdirSync } = require("fs");

const plist = require("simple-plist");

const dirs = [
  "PreferenceBundles",
  "PreferenceManifests",
  "PreferenceManifestsInternal"
];

const locales = {};
const stringsDict = {};

const fsOptions = {
  withFileTypes: true,
  encoding: "utf-8"
}

for (const dir of dirs) {
  const fullDirPath = join(mainPath, dir);
  const bundleList = readdirSync(fullDirPath, fsOptions).filter(f => {
    return (f.isDirectory() && f.name.endsWith(".bundle"));
  })
  for (const bundlePath of bundleList) {
    const fullBundlePath = join(fullDirpath, bundlePath)
    const fullItemList = readdirSync(fullBundlePath, fsOptions);
    const urlDictList = fullItemList.filter(f => {
      return (!f.isDirectory() && f.name.startsWith("SettingsSearchManifest"));
    })
    const lprojList = fullItemList.filter(f => {
      return (f.isDirectory() && f.name.endsWith(".lproj"));
    })
    for (const lproj of lprojList) {
      const localeName = lproj.name.split(".")[0];
      if (!(localeName in locales)) locales[localeName] = {};
      if (!(localeName in stringsDict)) stringsDict[localeName] = {};
      const manifestStringsList = readdirSync(join())
    }
  }
  
}