const express = require('express');
const router = express.Router();
const config = require('../config.json');

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

router.post('/upload/dropzone', function(req, res, next) {
    var torrentFile;


    if (!req.files) {
        res.json({success: false, error: 'No files were uploaded.'});
        return;
    }

    torrentFile = req.files.file;
    torrentFile.mv(`${config['rtorrent_auto_dir']}${req.files.file.name}`, function(err) {
        if (err) {
            res.status(500).json({succes: false, error: err.message});
            return;
        }
        res.json({success: true});
    });
});

module.exports = router;
