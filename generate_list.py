PARENT_DIR = "/System/Library/"
MANIFEST_DIRS = ["PreferenceManifests", "PreferenceManifestsInternal"]

"""
Create main URLs list (empty)

Create dictionary for localizations (empty)

For each directory in MANIFEST_DIRS:
    Get names of all directories in directory whose name ends in .bundle

    For each directory:
        Get names of all files whose name begins with 'SettingsSearchManifest-' and whose extension is '.plist'
        For each of those files:
            Open and read file
            Get value for key 'items' (value is a list)
            For each item in list:
                Add a dictionary to the main URLs list with the following key-value pairs:
                    {
                        keywords: keywords,
                        label: label,
                        url: searchURL
                    }
            
        Get all folders whose name ends in '.lproj'

        For each of those folders:
            Create a key for that localization name (folder name without .lproj) if it does not already exist in the localization dictionary
            Get all files inside that folder whose name begins with 'SettingsSearchManifest' and whose extension is '.strings'
            For each file:
                Open and read file
                Set key (name is part of file name after '-' without '.strings') to have value of type dictionary (copy the entire file contents to the dictionary value)

"""

"""
Output:
- Markdown list (English only)
- JSON for each localization
- JSON containing all URLs
- JSON (English only) formatted for alombi's site (for now)
"""