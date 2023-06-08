
const bcrypt = require('bcrypt');

const { queryTableCount } = require('./query');




const getpageCount = async (req, res) => {
    try {
        const routeTags = (req.query.tagsList!=null && req.query.tagsList!='') ? req.query.tagsList.split(',') : null;
        if (!req.query.tableName) {
            return res.status(400).json({ message: 'Invalid Data' });
        } else {
            const countRes = await queryTableCount(req.query.tableName, req.query.id, routeTags);
            if (countRes.status == 200) {
                res.status(200).json({ "pageCount": countRes.data });
            } else {
                res.status(countRes.status).json({ message: countRes.data }); // error handling
            }
        }
    } catch (error) {
        // logDebugInfo('error', 'batch_insert', 'riders', error.message, error.stack);
        res.status(500).json({ message: "Server Error " + error.message });
    }
}



const hashPassword = (password) => {
    return new Promise((resolve, reject) => {
      bcrypt.hash(password, 10, (err, hash) => {
        if (err) {
          reject(err);
        } else {
          resolve(hash.toString('hex'));
        }
      });
    });
  };


module.exports = { getpageCount ,hashPassword};