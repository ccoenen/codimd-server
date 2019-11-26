'use strict'

const archiver = require('archiver')
const async = require('async')
const Router = require('express').Router

const errors = require('../errors')
const config = require('../config')
const models = require('../models')
const logger = require('../logger')
const { urlencodedParser } = require('./utils')

const MeRouter = module.exports = Router()

// all the following routes require that the user be logged in
// most of them will proceed to use the user in question.
// this helper facilitates loading and error handling for all of them.
function withUser (req, res, callback) {
  if (req.isAuthenticated()) {
    models.User.findOne({
      where: {
        id: req.user.id
      }
    }).then(function (user) {
      if (!user) {
        return errors.errorNotFound(res)
      }
      callback(user)
    }).catch(function (err) {
      logger.error('user action failed: ' + err)
      return errors.errorInternalError(res)
    })
  } else {
    return errors.errorForbidden(res)
  }
}

// get me info
MeRouter.get('/me', function (req, res) {
  withUser(req, res, (user) => {
    var profile = models.User.getProfile(user)
    if (req.xhr) {
      res.send({
        status: 'ok',
        id: req.user.id,
        name: profile.name,
        photo: profile.photo
      })
    } else {
      models.Note.findAll({
        where: {
          ownerId: user.id
        }
      }).then(function (notes) {
        res.render('me.ejs', {
          title: 'Profile for ' + user.name,
          contributions: [],
          notes: notes,
          user: user
        })
      })
    }
  })
})

// update "me" info or password
MeRouter.post('/me', urlencodedParser, function (req, res) {
  withUser(req, res, (user) => {
    if (req.body.email !== '') {
      user.email = req.body.email
    }
    if (req.body.name !== '') {
      user.name = req.body.name
    }
    // TODO add facility for password-change, as well!
    user.save().then(() => {
      res.redirect(config.serverURL + '/me')
    })
  })
})

// delete the currently authenticated user
MeRouter.get('/me/delete/:token?', function (req, res) {
  withUser(req, res, (user) => {
    if (user.deleteToken === req.params.token) {
      user.destroy().then(function () {
        res.redirect(config.serverURL + '/')
      })
    } else {
      return errors.errorForbidden(res)
    }
  })
})

// export the data of the authenticated user
MeRouter.get('/me/export', function (req, res) {
  withUser(req, res, (user) => {
    models.Note.findAll({
      where: {
        ownerId: user.id
      }
    }).then(function (notes) {
      const archive = archiver('zip', {
        zlib: { level: 3 } // Sets the compression level.
      })
      res.setHeader('Content-Type', 'application/zip')
      res.attachment('archive.zip')
      archive.pipe(res)
      archive.on('error', function (err) {
        logger.error('export user data failed: ' + err)
        return errors.errorInternalError(res)
      })

      let filenames = {}
      async.each(notes, function (note, callback) {
        let basename = note.title.replace(/\//g, '-') // Prevent subdirectories
        let filename
        let suffix = ''
        do {
          let seperator = typeof suffix === 'number' ? '-' : ''
          filename = basename + seperator + suffix + '.md'
          suffix++
        } while (filenames[filename])
        filenames[filename] = true

        logger.debug('Write: ' + filename)
        archive.append(Buffer.from(note.content), { name: filename, date: note.lastchangeAt })
        callback(null, null)
      }, function (err) {
        if (err) {
          return errors.errorInternalError(res)
        }

        archive.finalize()
      })
    })
  })
})
