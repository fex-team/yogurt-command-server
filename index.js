'use strict';


var child_process = require('child_process');
var spawn = child_process.spawn;

exports.name = 'server';
exports.usage = '<command> [options]';
exports.desc = 'launch nodejs server';
exports.register = function(commander) {

    function getFrameworkUrl() {
        var pth = require('path');
        var filepath = pth.join(__dirname, 'package.json');
        if (fis.util.exists(filepath)) {
            var json = fis.util.readJSON(filepath);
            if (json['framework']) {
                return json['framework'];
            }
        }
    }

    function touch(dir) {
        if (fis.util.exists(dir)) {
            if (!fis.util.isDir(dir)) {
                fis.log.error('invalid directory [' + dir + ']');
            }
        } else {
            fis.util.mkdir(dir);
        }
        return fis.util.realpath(dir);
    }

    var root = touch((function() {
        var key = 'FIS_SERVER_DOCUMENT_ROOT';
        if (process.env && process.env[key]) {
            var path = process.env[key];
            if (fis.util.exists(path) && !fis.util.isDir(path)) {
                fis.log.error('invalid environment variable [' + key + '] of document root [' + path + ']');
            }
            return path;
        } else {
            return fis.project.getTempPath('www');
        }
    })());

    function open(path, callback) {
        fis.log.notice('browse ' + path.yellow.bold + '\n');
        var cmd = fis.util.escapeShellArg(path);
        if (fis.util.isWin()) {
            cmd = 'start "" ' + cmd;
        } else {
            if (process.env['XDG_SESSION_COOKIE']) {
                cmd = 'xdg-open ' + cmd;
            } else if (process.env['GNOME_DESKTOP_SESSION_ID']) {
                cmd = 'gnome-open ' + cmd;
            } else {
                cmd = 'open ' + cmd;
            }
        }
        child_process.exec(cmd, callback);
    }

    function getPidFile() {
        return fis.project.getTempPath('server/pid');
    }

    function lanuch(file) {
        var child_process = spawn(process.execPath, [file], {
            cwd: root
        });
        child_process.stderr.pipe(process.stderr);
        child_process.stdout.pipe(process.stdout);
        process.stderr.write(' ➜ server is running\n');
        fis.util.write(getPidFile(), child_process.pid);
    }

    function download(url, cb, force) {
        var pth = require('path');
        var sentry = fis.util.exists(pth.join(root, 'server.js'));
        if (sentry && !force) {
            cb()
        } else {
            fis.util.download(url, cb, root);
        }
    }
    function startServer() {
        download(getFrameworkUrl(), function() {
            if (fis.util.exists(root + '/Procfile')) {
                var content = fis.util.read(root + '/Procfile', true);
                var reg = /^web\s*:\s*.*?node\s+([\S]+)/im;
                var match = content.match(reg);
                if (match && match[1]) {
                    lanuch(match[1]);
                } else {
                    lanuch('.');
                }
            } else if (fis.util.exists(root + '/server.js')) {
                lanuch('server.js');
            } else {
                lanuch('.');
            }
        });
    }

    function start() {
        var cwd;
        if (fis.util.exists(root + '/server/package.json')) {
            cwd = root + '/server';
        } else if (fis.util.exists(root + '/package.json')) {
            cwd = root;
        }
        if (cwd) {
            var npm = child_process.exec('npm install', {
                cwd: cwd
            });
            npm.stderr.pipe(process.stderr);
            npm.stdout.pipe(process.stdout);
            npm.on('exit', function(code) {
                if (code === 0) {
                    startServer();
                } else {
                    process.stderr.write('launch server failed\n');
                }
            });
        } else {
            startServer();
        }
    }

    function stop(callback) {
        var tmp = getPidFile();
        if (fis.util.exists(tmp)) {
            var pid = fis.util.fs.readFileSync(tmp, 'utf8').trim();
            var list, msg = '';
            var isWin = fis.util.isWin();
            if (isWin) {
                list = spawn('tasklist');
            } else {
                list = spawn('ps', ['-A']);
            }

            list.stdout.on('data', function(chunk) {
                msg += chunk.toString('utf-8').toLowerCase();
            });

            list.on('exit', function() {
                msg.split(/[\r\n]+/).forEach(function(item) {
                    var reg = new RegExp('\\bnode\\b', 'i');
                    if (reg.test(item)) {
                        var iMatch = item.match(/\d+/);
                        if (iMatch && iMatch[0] == pid) {
                            try {
                                process.kill(pid, 'SIGINT');
                                process.kill(pid, 'SIGKILL');
                            } catch (e) {}
                            process.stdout.write('shutdown node process [' + iMatch[0] + ']\n');
                        }
                    }
                });
                fis.util.fs.unlinkSync(tmp);
                if (callback) {
                    callback();
                }
            });
        } else {
            if (callback) {
                callback();
            }
        }
    }

    commander
        .option('-p, --port <int>', 'server listen port', parseInt, 8080)
        .action(function() {
            var args = Array.prototype.slice.call(arguments);
            var options = args.pop();
            var cmd = args.shift();
            if (root) {
                if (fis.util.exists(root) && !fis.util.isDir(root)) {
                    fis.log.error('invalid document root [' + root + ']');
                } else {
                    fis.util.mkdir(root);
                }
            } else {
                fis.log.error('missing document root');
            }
            
            process.env.PORT = options.port;
            switch (cmd) {
                case 'start':
                    stop(start);
                    break;
                case 'stop':
                    stop(function() {});
                    break;
                case 'open':
                    open(root);
                    break;
                case 'clean':
                    process.stdout.write(' δ '.bold.yellow);
                    var now = Date.now();
                    var include = fis.config.get('server.clean.include', null);
                    var exclude = fis.config.get('server.clean.exclude', root + '/node_modules/');
                    fis.util.del(root, include, exclude);
                    process.stdout.write((Date.now() - now + 'ms').green.bold);
                    process.stdout.write('\n');
                    break;
                case 'update':
                    download(getFrameworkUrl(), function() {fis.log.notice('update success.');}, true);
                    break;
                default:
                    commander.help();
            }
        });

    commander
        .command('start')
        .description('start server');

    commander
        .command('stop')
        .description('shutdown server');

    commander
        .command('open')
        .description('open document root directory');

    commander
        .command('clean')
        .description('clean files in document root');

    commander
        .command('update')
        .description('update server framework');
};