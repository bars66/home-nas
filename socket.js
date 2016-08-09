"use strict";

const ytdl = require('youtube-dl');
const fs = require('fs');
const config = require('./config.json');
const download = require('download');
const spawn = require('child_process').spawn;

function io(io) {
    io.on('connection', function(socket){
        console.log('connect');

        socket.on('try_download', function (url) {
            socket.emit('youtube_dl_download');
            ytdl.getInfo(url, function getInfo(error, info) {
                if (error) {
                    io.emit('youtube_dl_error', error.message);
                    console.log(error);
                    return;
                }

                let format = null;
                let maxResolution = 0;
                const formats = info.formats;

                for (let i = 0; i != formats.length; ++i) {
                    if ((maxResolution < Number(formats[i].width) && Number(formats[i].width) <= 1920) || (maxResolution === formats[i].width && formats[i].ext == 'mp4')) {
                        maxResolution = formats[i].width;
                        format = formats[i];
                    }
                }

                io.emit('youtube_dl_start_download');

                console.log(format);

                let video;

                try {
                    video = ytdl(url, ['--merge-output-format', 'mp4'], {cwd: __dirname});
                } catch (error) {
                    io.emit('youtube_dl_error', error.message);
                }
                // if (format != null) {
                //     video = ytdl(url, ['-f', `${format.format_id}+bestaudio`]);
                //     console.log(['-f', `137`]);
                //     // video = ytdl(url,
                //     //     [`--format=${format.format_id}+bestaudio`, '--merge-output-format=mp4'],
                //     //     { cwd: __dirname });
                // } else {
                //     video = ytdl(url,
                //         { cwd: __dirname });
                // }

                video.on('error', function (error) {
                    io.emit('youtube_dl_error', error.message);
                });

                video.on('info', function(info) {
                    let sizeDownload = 0;

                    console.log('Download started');
                    console.log('filename: ' + info.filename);
                    console.log('size: ' + info.size);

                    video.on('data', function (chunk) {
                        sizeDownload += chunk.length;
                        socket.emit('youtube_dl_progress', {
                            filename: info._filename,
                            size: info.size,
                            download: sizeDownload
                        });
                    });
                });

                video.pipe(fs.createWriteStream(`${config['youtube_path']}${info.filename}.mp4`));
            });
        });

        socket.on('download_files', function (url) {
            var download = download({extract: true, strip: 1})
                .get(url)
                .dest(config['home_downloads'])
                .run();
            console.log(download);
            // const download = download(url, config['home_downloads']).then(() => {
            //     console.log('done!');
            // }).catch(function (error) {
            //     console.log(error);
            // });


            // downloadT.on('data', function () {
            //     console.log('kokok');
            // })
        });

        socket.on('start_media', function () {
            const m = spawn('systemctl', ['start', 'mediatomb']);
            const m1 = spawn('systemctl', ['start', 'mediatomb_new']);
            socket.emit('media_ok');
            console.log('ok');
        });

        socket.on('disconnect', function(){});
    });
}

module.exports = io;

