import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { basename, extname, join, resolve } from "path";
import plist from "simple-plist";
import { execFileSync } from "child_process";
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
const overrides = JSON.parse(readFileSync(OVERRIDES_PATH, { encoding: "utf-8" }));
const urlsMasterMap = new Map();
const locales = new Map();
const overrideChildren = new Set();
let mainPath;
const readSystemVersion = () => plist.readFileSync(join(mainPath, "CoreServices", "SystemVersion.plist"));
const removeExtension = (pathName) => pathName.substring(0, pathName.lastIndexOf(".")) || pathName;
const readDirectory = (path) => readdirSync(path, {
    withFileTypes: true,
    encoding: "utf-8"
});
class UrlItem {
    label;
    url;
    id;
    pathComponents;
    constructor(item, manifestPath) {
        this.label = item.label;
        this.url = item.searchURL;
        const settingsUrl = new URL(item.searchURL);
        const params = new URLSearchParams(settingsUrl.pathname);
        this.id = removeExtension(manifestPath);
        this.pathComponents = [settingsUrl.protocol, params.get("root")];
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
const addItemToMaster = (urlItem, urlsMap, pathIndex = 0) => {
    const urlKey = urlItem.pathComponents[pathIndex];
    if (pathIndex === urlItem.pathComponents.length - 1) {
        ++totalUrls;
        if (urlsMap.has(urlKey)) {
            urlsMap.get(urlKey).rootItem = urlItem;
        }
        else {
            urlsMap.set(urlKey, urlItem);
        }
    }
    else {
        let nextLevel = urlsMap.get(urlKey);
        if (nextLevel && nextLevel instanceof UrlItem) {
            urlsMap.set(urlKey, (nextLevel = {
                rootItem: nextLevel,
                children: new Map()
            }));
        }
        else {
            nextLevel ?? urlsMap.set(urlKey, (nextLevel = {
                rootItem: undefined,
                children: new Map()
            }));
        }
        addItemToMaster(urlItem, nextLevel.children, pathIndex + 1);
    }
};
const readManifest = (manifestPath) => {
    for (const item of plist.readFileSync(manifestPath).items) {
        addItemToMaster(new UrlItem(item, manifestPath), urlsMasterMap);
    }
};
const scanLproj = (lprojPath) => {
    const localeName = removeExtension(basename(lprojPath));
    if (!locales.has(localeName)) {
        locales.set(localeName, new Map());
    }
    const localeMap = locales.get(localeName);
    if (!locales.has(localeName)) {
        locales.set(localeName, new Map());
    }
    for (const f of readDirectory(lprojPath)) {
        if (!f.isDirectory() && f.name.startsWith(SSM) && extname(f.name) === ".strings") {
            localeMap.set(resolve(lprojPath, "..", removeExtension(f.name)), plist.readFileSync(join(lprojPath, f.name)));
        }
    }
};
const scanBundle = (bundlePath) => {
    for (const f of readDirectory(bundlePath)) {
        const fullPath = join(bundlePath, f.name);
        if (f.isDirectory() && extname(f.name) === ".lproj") {
            scanLproj(fullPath);
        }
        else if (f.name.startsWith(SSM) && extname(f.name) === ".plist") {
            readManifest(fullPath);
        }
    }
};
const scanDir = (dirPath) => {
    for (const f of readDirectory(dirPath)) {
        if (f.isDirectory()) {
            const fullSubDirPath = join(dirPath, f.name);
            if (extname(f.name) === ".bundle") {
                scanBundle(fullSubDirPath);
            }
            else if (f.name !== "_CodeSignature") {
                scanDir(fullSubDirPath);
            }
        }
    }
};
const getLocaleItem = (fileId, labelName, locale) => {
    return locales.get(locale).get(fileId)?.[labelName]
        ?? locales.get(DEFAULT_LOCALE).get(fileId)[labelName];
};
const addUrlToResult = (result, key, value) => {
    const existing = result[key];
    if (typeof existing !== "object") {
        result[key] = value;
    }
};
let needsOverrideIndex = 0;
const buildLocalizedObject = (entry, locale) => {
    const result = {};
    if (entry.rootItem) {
        result[ROOT_STR] = entry.rootItem.url;
    }
    for (const value of entry.children.values()) {
        if (value instanceof UrlItem) {
            addUrlToResult(result, getLocaleItem(value.id, value.label, locale), value.url);
        }
        else {
            let key;
            if (value.rootItem) {
                key = getLocaleItem(value.rootItem.id, value.rootItem.label, locale);
            }
            else {
                key = `NEEDS_OVERRIDE_${needsOverrideIndex++}`;
                overrideChildren.add(value.children.entries().next().value[1].url);
            }
            addUrlToResult(result, key, buildLocalizedObject(value, locale));
        }
    }
    return result;
};
const jsonToMd = (json, stream, prefix) => {
    for (const [key, value] of Object.entries(json)) {
        const newPrefix = `${prefix || "- "}${key === ROOT_STR ? "" : `${prefix ? " → " : ""}${key}`}`;
        if (typeof value === "string") {
            stream.write(`${newPrefix}: \`${value}\`\n`);
        }
        else {
            jsonToMd(value, stream, newPrefix);
        }
    }
};
mainPath = join("/", "System", "Library");
switch (process.platform) {
    case "darwin":
        break;
    case "linux":
        execFileSync("mount", ["-t", "real", "/", "/mnt"]);
        mainPath = join("/", "mnt", mainPath);
        break;
    default:
        throw new Error("Unsupported platform: " + process.platform);
}
let systemVersion = readSystemVersion();
switch (systemVersion.ProductName) {
    case "Mac OS X":
    case "macOS":
        mainPath = join("/", "Applications", "Xcode.app", "Contents", "Developer", "Platforms", "iPhoneOS.platform", "Library", "Developer", "CoreSimulator", "Profiles", "Runtimes", "iOS.simruntime", "Contents", "Resources", "RuntimeRoot", mainPath);
        systemVersion = readSystemVersion();
    case "iPhone OS":
        break;
    default:
        throw new Error("Unsupported platform: " + process.platform);
}
for (const name of DIRS) {
    scanDir(join(mainPath, name));
}
scanBundle(join(mainPath, "PrivateFrameworks", "PBBridgeSupport.framework"));
overrides.forEach((item, i) => {
    const labelId = String(i);
    addItemToMaster(new UrlItem({ searchURL: item.url, label: labelId }, OVERRIDES_PATH), urlsMasterMap);
    for (const locale of Object.keys(item.label)) {
        const localeMap = locales.get(locale);
        if (!localeMap.has(OVERRIDES_LOCALES_KEY)) {
            localeMap.set(OVERRIDES_LOCALES_KEY, {});
        }
        localeMap.get(OVERRIDES_LOCALES_KEY)[labelId] = item.label[locale];
    }
});
const versionsPath = join(".", "versions");
if (!existsSync(versionsPath)) {
    mkdirSync(versionsPath);
}
const versionPath = join(versionsPath, systemVersion.ProductVersion);
if (!existsSync(versionPath)) {
    mkdirSync(versionPath);
}
for (const locale of locales.keys()) {
    const localePath = join(versionPath, locale);
    if (!existsSync(localePath)) {
        mkdirSync(localePath);
    }
    for (const [scheme, dict] of urlsMasterMap.entries()) {
        const schemeName = scheme.slice(0, -1);
        const result = buildLocalizedObject(dict, locale);
        writeFileSync(join(localePath, `${schemeName}.json`), JSON.stringify(result, undefined, 2));
        const mdStream = createWriteStream(join(localePath, `${schemeName}.md`));
        jsonToMd(result, mdStream);
        mdStream.end();
    }
}
if (overrideChildren.size) {
    const needOverridesPath = join(versionPath, "needOverrides.txt");
    console.warn(`${overrideChildren.size} URLs need manual overrides. See ${needOverridesPath} for the list.`);
    const needOverridesStream = createWriteStream(needOverridesPath);
    for (const url of overrideChildren) {
        needOverridesStream.write(url + "\n");
    }
    needOverridesStream.end();
}
