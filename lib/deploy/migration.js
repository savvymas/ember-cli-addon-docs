const fs = require('fs-extra');
const path = require('path');

module.exports = function maybeMigrateSiteFormat(context, plugin) {
  return shouldMigrate(context).then(weShould => {
    if (weShould) {
      return migrateSiteFormat(context, plugin);
    }
  })
}

function shouldMigrate(context) {
  // we should migrate if there a `versions.json` file but no `versions` folder
  return directoryExists(path.join(context.gitDeploy.worktreePath, "versions"))
  .then(hasVersions => {
    if (hasVersions){
      return false;
    }
    return fs.stat(path.join(context.gitDeploy.worktreePath, "versions.json"))
      .then(() => true, () => false);
    });
}

function migrateSiteFormat(context, plugin) {
    let stagingDirectory = context.addonDocs.stagingDirectory;
    let versionedApps = discoverLegacyVersionedApps(stagingDirectory);

    moveVersionedApps(stagingDirectory, versionedApps);
    moveLatestToRoot(stagingDirectory);
    rewriteIndexHTMLs(stagingDirectory);
    rewriteVersionsJSON(stagingDirectory, plugin);
}

function moveVersionedApps(stagingDirectory, versionedApps){
    fs.mkdirSync(path.join(stagingDirectory, "versions"));
    versionedApps.forEach(name => {
      fs.renameSync(path.join(stagingDirectory, name), path.join(stagingDirectory, 'versions', name));      
    });
}

function moveLatestToRoot(stagingDirectory){
    let latestContents;
    try {
      latestContents = fs.readdirSync(path.join(stagingDirectory, 'versions', 'latest'));
    } catch (err){
      if (err.code !== 'ENOENT') {
        throw err;
      }
      latestContents = [];
    }
    latestContents.forEach(name => {
      fs.renameSync(path.join(stagingDirectory, 'versions', 'latest', name), path.join(stagingDirectory, name));
    });
    fs.rmdirSync(path.join(stagingDirectory, 'versions', 'latest'));
}

function rewriteIndexHTMLs(stagingDirectory){
    fs.readdirSync(path.join(stagingDirectory, 'versions')).forEach(appName => {
        rewriteIndexHTML(path.join(stagingDirectory, 'versions', appName, 'index.html'), appName, 'versions/' + appName);
    })
    rewriteIndexHTML(path.join(stagingDirectory, 'index.html'), 'latest', '');
}

function rewriteIndexHTML(filename, oldPath, newPath){
    let indexPath = `${filename}`;
    let contents = fs.readFileSync(indexPath, 'utf-8');
    let updated = contents.replace(new RegExp(oldPath, 'g'), `/${newPath}/`);

    fs.writeFileSync(indexPath, updated);
}

function rewriteVersionsJSON(stagingDirectory, plugin){
  let oldpath = plugin._getVersionPath();
  let curpath = path.join('versions', plugin._getVersionPath());
  let name = plugin.userConfig.getVersionName();
  let sha = plugin.userConfig.repoInfo.sha;
  let tag = plugin.userConfig.repoInfo.tag;
  return { path: curpath, path2: oldpath, name, sha, tag };
}

function discoverLegacyVersionedApps(stagingDirectory){
    return fs.readdirSync(stagingDirectory).filter(name => {
      // a versioned app is a directory that contains index.html
      let dir = path.join(stagingDirectory, name);
      if (!fs.statSync(dir).isDirectory()) {
        return false;
      }
      try {
        fs.statSync(path.join(dir, "index.html"));
        return true;
      } catch(err) {
        if (err.code !== 'ENOENT') {
          throw err;
        }
        return false;
      }
    });
}

function directoryExists(dir){
    return fs.stat(dir)
      .then(stats => {
        return stats.isDirectory();
      }, err => {
        return false;
      });
  }