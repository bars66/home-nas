"use strict";

const ytdl = require('youtube-dl');
const fs = require('fs');
const config = require('./config.json');
const download = require('download');
const spawn = require('child_process').spawn;
const request = require('request-promise');

const cookieStore = request.jar();

const services = [
  {
    name: 'Kinozal.tv - torrent',
    url: 'kinozal',

    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/63.0.3239.108 Safari/537.36',
    download: async (service, cookieStore, url) => {
      if (!service.init) {
        throw new Error('Service is not initialized');
      }

      const cookie = cookieStore.getCookieString('http://kinozal.me/');
      const urlparsed = url.match(/details.php\?id=(\d*)/);
      if (urlparsed.length !== 2) {
        throw new Error('Неправильный урл. Ожидается details.php?id=XXXXXXX');
      }
      const filePath = `${config['rtorrent_auto_dir']}`;

      const options = {
        headers: {
          cookie,
          'User-Agent': service.ua
        },
        filename: `kinozal-tv-${urlparsed[1]}.torrent`,
    	}
      await download(`http://dl.kinozal.me/download.php?id=${urlparsed[1]}`, filePath, options);
    },
    auth: async (service, cookieStore) => {
      try {
        const optionsInit = {
          url: 'http://kinozal.me/',
          jar: cookieStore,
          headers: {
            'User-Agent': service.ua
          }
        };
        await request.get(optionsInit);
        const authOptions = {
          url: 'http://kinozal.me/takelogin.php',
          jar: cookieStore,
          headers: {
            'User-Agent': service.ua
          },
          form: {
            username: service.login,
            password: service.password,
            returnto: '',
          }
        }
        try {
          await request.post(authOptions);
        } catch (error) {
          if (error.responseCode > 400) {
            throw new Error(error);
          }
        }
        service.init = true;
        console.log('Kinozal init');
      } catch (error) {
        console.log('Error where init kinozal source: ', error);
      }
    }
  },
  {
    name: 'koshara',
    url: 'koshara',

    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/63.0.3239.108 Safari/537.36',
    download: async (service, cookieStore, url) => {
      if (!service.init) {
        throw new Error('Service is not initialized');
      }

      const options = {
        url,
        jar: cookieStore,
        headers: {
          'User-Agent': service.ua
        }
      };

      const answer = await request.get(options);
      const torrentUrls = answer.match(/engine\/download.php\?id=(\d*)/);
      if (!torrentUrls || torrentUrls.length !== 2) {
        throw new Error('Похоже на странице нет торрент-файлов. Облом.');
      }

      const filePath = `${config['rtorrent_auto_dir']}`;
      const cookie = cookieStore.getCookieString('http://koshara.co/');

      const optionsDownload = {
        headers: {
          cookie,
          'User-Agent': service.ua
        },
        filename: `koshara-${torrentUrls[1]}.torrent`,
    	}
      await download(`http://koshara.co/${torrentUrls[0]}`, filePath, optionsDownload);
    },
    auth: async (service, cookieStore) => {
      try {
        const optionsInit = {
          url: 'http://koshara.co/',
          jar: cookieStore,
          headers: {
            'User-Agent': service.ua
          }
        };
        await request.get(optionsInit);
        // Просто сходим, пусть кука будет
        service.init = true;
        console.log('Coshara init');
      } catch (error) {
        console.log('Error where init kinozal source: ', error);
      }
    }
  }
]
async function initStores() {
  for (let i = 0; i != services.length; ++i) {
    services[i] = Object.assign(services[i], config.sources[services[i].name]);
    await services[i].auth(services[i], cookieStore);
  }

}
initStores();

let TVs = {
  zal: {
    channels: [],
  }
}


setInterval(async () => {
  const options = {
    uri: 'http://192.168.40.61:1925/1/channels',
    json: true,
  };
  try {
    TVs.zal.channels = await request.get(options);
  } catch(error) {
    TVs.zal.channels = [];
  }
}, 5000);

function io(io) {
    io.on('connection', function(socket){
        console.log('connect');

        socket.on('getChannels', function () {
          socket.emit('TVs', TVs);
        })

        socket.on('try_download', async function (url) {
            const service = services.find(service => url.includes(service.url));
            if (service) {
              console.log('START: ', service.name, url);
              io.emit('youtube_dl_start_download');
              try {
                await service.download(service, cookieStore, url);
              } catch (error) {
                io.emit('youtube_dl_error', error.message);
              }
              return;
            }

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

        socket.on('philips-control', async function (type, button) {
            if (type === 'zal') {
              const options = {
                method: 'POST',
                uri: 'http://192.168.40.61:1925/1/input/key',
                body: {
                    key: button
                },
                json: true // Automatically stringifies the body to JSON
              }
              try {
                await request(options);
              } catch (error) {
                console.log(error);
              }
            }
        });

        socket.on('philips-control-channel', async function (type, id) {
            if (type === 'zal') {
              const options = {
                method: 'POST',
                uri: 'http://192.168.40.61:1925/1/channels/current',
                body: {
                    id: id
                },
                json: true // Automatically stringifies the body to JSON
              }
              try {
                await request(options);
              } catch (error) {
                console.log(error);
              }
            }
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
