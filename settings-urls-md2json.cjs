// Convert 'settings-urls.md' from https://github.com/FifiTheBulldog/ios-settings-urls to JSON
// by @atnbueno (2021-02-12). License: MIT

fs = require('fs')

// adapted from https://stackoverflow.com/a/20240290
function setDeepValue(obj, path, value) {
    var a = path.split(' → ')
    var o = obj
    while (a.length - 1) {
        var n = a.shift()
        if (!(n in o)) o[n] = {}
        o = o[n]
    }
    o[a[0]] = value
}

fs.readFile('settings-urls.md', 'utf8', function(err, data) {
    // clean up Markdown
    data = data.replace(/\r/g, ''); // unix EOLs
    data = data.replace(/- (.+):\n    - (.+)\n    - (.+)/g, "- $1: $2 or $3"); // two URLs, format as "or"
    data = data.replace(/- (.+): `(.+)`(?=\n- \1 → )/g, "- $1 → (root): `$2`"); // label root pages
    data = data.replace(/%20/g, ' '); // undo partial URL encoding
    data = data.replace(/%26/g, '&');
    data = data.replace(/%3A/g, ':');
    data = data.replace(/(\.{3}|%E2%80%A6)/g, '…'); // unicode ellipsis
    data = data.replace(/URL encoded family member name/gi, 'URL-encoded Family Member Name'); // same variables
    data = data.replace(/URL encoded VPN configuration name/g, 'URL-encoded VPN Configuration Name');
    data = data.replace(/specific app/g, 'App Name');
    data = data.replace(/(bundle id here|bundle ID|bundle.id.here)/g, 'App Bundle ID');
    data = data.replace(/(?<=&path=)[^`]+/g, function(path) { // encode path except slashes and variable parts
        let parts = path.split('/');
        parts.forEach(function(part, i) {
            this[i] = part.startsWith('[') ? part : encodeURIComponent(part);
        }, parts);
        return parts.join('/');
    });

    // save cleaned up Markdown
    // fs.writeFile('settings-urls-clean.md', data, function(err) {
    //     if (err) return console.log(err);
    //     console.log('Markdown cleaned up and saved to "settings-urls-clean.md"');
    // });

    // assemble settings object
    const itemRE = /- ([^:]+): `(.+)`/ig;
    let settings = {},
        item = itemRE.exec(data),
        value;
    while (item != null) {
        value = item[2].split("` or `");
        if (value.length == 1) {
            value = value[0];
        }
        setDeepValue(settings, item[1], value);
        item = itemRE.exec(data);
    }

    // save settings as JSON twice: with the original order, and with alphabetically sorted keys
    fs.writeFile('settings-urls.json', JSON.stringify(settings, null, 4), function(err) {
        console.log('JSON and saved to "settings-urls.json"');
    });
    let keys = [];
    JSON.stringify(settings, (key, value) => { keys.push(key); return value });
    keys.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })); // case-insensitive sort
    fs.writeFile('settings-urls-sorted.json', JSON.stringify(settings, keys, 4), function(err) {
        console.log('JSON sorted and saved to "settings-urls-sorted.json"');
    });
});