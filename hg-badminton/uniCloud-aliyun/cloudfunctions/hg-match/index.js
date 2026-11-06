'use strict'

/**
 * hg-match — 比赛全流程：发布、队伍、对阵、上场名单、记分、赛果、观众
 */

const { createHandler } = require('hg-shared')
const helpers = require('./lib/helpers')
const createMatchActions = require('./lib/actions-match')
const createTeamActions = require('./lib/actions-team')
const createFixtureActions = require('./lib/actions-fixture')
const createScheduleActions = require('./lib/actions-schedule')
const createScoreActions = require('./lib/actions-score')

const actions = {}
Object.assign(
  actions,
  createMatchActions(helpers, actions),
  createTeamActions(helpers, actions),
  createFixtureActions(helpers, actions),
  createScheduleActions(helpers),
  createScoreActions(helpers, actions)
)

exports.main = createHandler(actions)
