// =====================================================================
//  middleware/uploadMiddleware.js
//
//  This is the only file that knows anything about multer.
//
//  What multer actually does:
//  A normal request body is text, and express.json() turns that text
//  into req.body. A file upload is NOT text - it arrives in a format
//  called multipart/form-data, which express.json() cannot read at all.
//  Multer reads that format instead. It writes the file to disk and
//  hands your controller a description of what it wrote.
//
//  It is middleware, exactly like authMiddleware: it runs before the
//  controller, adds something to req, and calls next().
// =====================================================================

const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Where the files land. It has to be inside public/ so that
// express.static can serve them back to the browser with no extra code.
const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads', 'products');

// Create the folder if it does not exist yet. recursive:true makes the
// whole chain public/uploads/products in one go.
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ---------------------------------------------------------------------
//  WHERE and WHAT NAME
//
//  Both are functions rather than fixed values, because multer calls
//  them once per file. cb means "callback" - cb(null, x) says
//  "no error, use x".
// ---------------------------------------------------------------------
const storage = multer.diskStorage({

  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR);
  },

  filename: function (req, file, cb) {
    // NEVER keep the name the user gave. Two sellers both uploading
    // "photo.jpg" would overwrite each other, and a crafted filename
    // could try to escape the folder.
    // Date.now() plus a random number is unique enough here.
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = Date.now() + '-' + Math.round(Math.random() * 100000) + ext;
    cb(null, safeName);
  }
});

// ---------------------------------------------------------------------
//  WHAT IS ALLOWED THROUGH
//  Without this, someone could upload a .exe and your server would
//  happily store it and serve it to visitors.
// ---------------------------------------------------------------------
function fileFilter(req, file, cb) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

  if (allowed.includes(file.mimetype)) {
    cb(null, true);            // accept
  } else {
    cb(new Error('Only JPG, PNG, WEBP or GIF images are allowed'));
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024,   // 2 MB per file
    files: 5                     // 5 files per product
  }
});

// ---------------------------------------------------------------------
//  A WRAPPER, so a bad upload becomes a clean JSON message.
//
//  upload.array(...) is itself a middleware. If it fails - file too
//  big, wrong type - it throws, and without this wrapper Express would
//  return an ugly HTML error page that your fetch() cannot read.
//  Here we catch the error and answer with 400 + a sentence.
//
//  'images' is the field name the browser must use when appending
//  files. It has to match FormData.append('images', file) on the page.
// ---------------------------------------------------------------------
function uploadProductImages(req, res, next) {
  const handler = upload.array('images', 5);

  handler(req, res, function (err) {
    if (err) {
      // multer's own size error has a code; ours is a plain Error
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: 'Each image must be under 2 MB' });
      }
      return res.status(400).json({ message: err.message });
    }
    next();
  });
}

module.exports = uploadProductImages;