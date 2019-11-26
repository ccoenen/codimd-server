'use strict'

const i18n = require('i18n')
const Router = require('express').Router

const { generateAvatar } = require('../letter-avatars')
const models = require('../models')
const response = require('../response')
const logger = require('../logger')

const UserRouter = module.exports = Router()

UserRouter.get('/user/:username/avatar.svg', function (req, res, next) {
  res.setHeader('Content-Type', 'image/svg+xml')
  res.setHeader('Cache-Control', 'public, max-age=86400')
  res.send(generateAvatar(req.params.username))
})

UserRouter.get('/user/:username', function (req, res, next) {
  return models.User.findOne({
    where: {
      $or: [
        { id: req.params.username },
        { username: req.params.username }
      ]
    }
  }).then(function (user) {
    if (!user) {
      return response.errorNotFound(res)
    }

    if (user.id === req.params.username) {
      logger.warn('user referred to by userid from the outside. Source of the link: %s', req.get('Referrer'))
      return res.redirect('/user/' + user.username) // TODO serverURL needs to go in front!
    }

    models.Note.findAll({
      where: {
        ownerId: user.id
      }
    }).then(function (notes) {
      res.render('user.ejs', {
        title: i18n.__('Profile for %s', user.name),
        notes: [], // notes, // disabled until fe figure out if we want this or not
        contributions: [], // not yet implemented
        user: user
      })
    })
  }).catch(function (err) {
    logger.error(err)
    return response.errorInternalError(res)
  })
})
