import webapp2
from google.appengine.ext import webapp
from google.appengine.ext import ndb
from google.appengine.api import users

from google.appengine.runtime import apiproxy_errors

import jinja2

import logging
import os
import json

from google.appengine.api import urlfetch


SC_BASE_URL = "https://api.soundcloud.com/users/"
SC_URL_END = '.json?client_id=f90fa65cc94d868d957c0b529c5ecc3d&limit=50'

JINJA_ENVIRONMENT = jinja2.Environment(
    loader=jinja2.FileSystemLoader(os.path.dirname(__file__)),
    extensions=['jinja2.ext.autoescape'])

class Log(ndb.Model):
    sc_id = ndb.StringProperty(default="")
    sc_username = ndb.StringProperty(default="")
    sc_fullname = ndb.StringProperty(default="")
    created = ndb.DateTimeProperty(auto_now_add=True)
    last_seen = ndb.DateTimeProperty(auto_now=True)
    number_visits = ndb.IntegerProperty(default=0)
    sc_permalink_url = ndb.StringProperty(default='')
    sc_avatar_url = ndb.StringProperty(default='')
    sc_country = ndb.StringProperty(default='')

class LogHandler(webapp.RequestHandler):
    def post(self):
        if users.is_current_user_admin():
            logging.info("visit from admin - not loggin' this!")
            return
        log = Log.get_by_id(self.request.get('id'))
        if not log:
            log = Log(id=self.request.get('id'))
            log.sc_id=self.request.get('id')
        # update data
        log.sc_username=self.request.get('username')
        log.sc_fullname=self.request.get('fullname')
        log.sc_avatar_url=self.request.get('avatar_url')
        log.sc_country=self.request.get('country')
        logging.info(log.sc_avatar_url)
        log.sc_permalink_url=self.request.get('permalink_url')
        # bump counter
        log.number_visits +=1
        log.put()
        logging.info(log)


class ShowStats(webapp2.RequestHandler):
    def get(self):
        logs = Log.query().order(-Log.last_seen).fetch(1000)
        templ_val = {'logs': logs}
        template = JINJA_ENVIRONMENT.get_template('Logs.html')
        self.response.write(template.render(templ_val))


def makeRequests(orders, quick=False):
    req_counter = 0
    reqs = {}
    # for each user, get whatever is requested
    for (user_id, user_data) in orders.iteritems():
        # speedy mode for development
        if quick and req_counter >= 5:
            break
        if req_counter >= 500:
            logging.info('skipping remaining requests')
            break
        reqs[user_id] = {}
        # user_data is list of data_types in the SC API
        for data_type in user_data:
            # fire requests to SC API
            rpc = urlfetch.create_rpc(deadline=3)
            urlfetch.make_fetch_call(
                rpc, SC_BASE_URL + user_id + '/' + data_type + SC_URL_END)
            reqs[user_id][data_type] = rpc
            # bump counter
            req_counter +=1
    logging.info('%s reqs out' % req_counter)
    return reqs


class SoundsHandler(webapp2.RequestHandler):
    def post(self):
        self.response.headers.add_header("Access-Control-Allow-Origin", "*")
        self.response.headers.add_header("Content-Type", "application/json")
        self.response.headers.add_header("Access-Control-Allow-Headers", "x-requested-with")

        orders = json.loads(self.request.get('orders'))
        quick = 'quick' in self.request.arguments() # make only 5 reqs, for loacl testing
        reqs = makeRequests(orders, quick)

        # consolidate received sounds:
        # store relevant data for each song and associate songs with users
        sounds = {}
        connectedSounds = {}

        for (user_id,req_dict) in reqs.iteritems():
            connectedSounds[user_id] = []
            for (data_type, rpc) in req_dict.iteritems():
                try:
                    result = rpc.get_result()
                    if result.status_code != 200: continue
                    soundList = json.loads(result.content)
                    for soundData in soundList:
                        if soundData['id'] not in sounds:
                            try:
                                sounds[soundData['id']] = { # data relevant for us
                                    'id': soundData['id'],
                                    'created_at': soundData['created_at'],
                                    'permalink_url': soundData['permalink_url'],
                                    'artwork_url': soundData['artwork_url'],
                                    'title': soundData['title']
                                }
                            except KeyError, e:
                                logging.info('passing: %s' % e)
                                logging.info(soundData)
                        connectedSounds[user_id].append(soundData['id']) # associate with user
                except urlfetch.DownloadError, e:
                    # Request timed out or failed.
                    logging.info('error getting %s for user %s: %s' %
                        (data_type,user_id, str(e)))
                except apiproxy_errors.OverQuotaError, message:
                    logging.error(message)
                    break
        self.response.write(json.dumps({
            'kinds': sounds,
            'connections': connectedSounds,
            }))


class FollowingsHandler(webapp2.RequestHandler):
    def post(self):
        self.response.headers.add_header("Access-Control-Allow-Origin", "*")
        self.response.headers.add_header("Content-Type", "application/json")
        self.response.headers.add_header("Access-Control-Allow-Headers", "x-requested-with")

        orders = json.loads(self.request.get('orders'))
        quick = 'quick' in self.request.arguments() # make only 5 reqs, for loacl testing
        reqs = makeRequests(orders, quick)

        # consolidate received users:
        # store relevant data for each users and associate followings with users
        users = {}
        followings = {}

        for (user_id,req_dict) in reqs.iteritems():
            followings[user_id] = []
            for (data_type, rpc) in req_dict.iteritems():
                try:
                    result = rpc.get_result()
                    if result.status_code != 200: continue
                    followingList = json.loads(result.content)
                    for userData in followingList:
                        if userData['id'] not in users:
                            try:
                                users[userData['id']] = { # data relevant for us
                                    'id': userData['id'],
                                    'avatar_url': userData['avatar_url'],
                                    'followings_count': userData['followings_count'],
                                    'full_name': userData['full_name'],
                                    'permalink': userData['permalink'],
                                    'permalink_url': userData['permalink_url'],
                                    'playlist_count': userData['playlist_count'],
                                    'track_count': userData['track_count'],
                                    'username': userData['username'],
                                }
                            except KeyError, e:
                                logging.info('passing: %s' % e)
                                logging.info(userData)
                        followings[user_id].append(userData['id']) # associate with user
                except urlfetch.DownloadError, e:
                    # Request timed out or failed.
                    logging.info('error getting %s for user %s: %s' %
                        (data_type,user_id, str(e)))
                except apiproxy_errors.OverQuotaError, message:
                    logging.error(message)
                    break
        self.response.write(json.dumps({
            'kinds': users,
            'connections': followings
            }))


class DataHandler(webapp2.RequestHandler):
    def post(self):
        orders = json.loads(self.request.get('orders'))
        req_counter = 0
        reqs = {}
        # for each user, get whatever is requested
        for (user_id, user_data) in orders.iteritems():
            # speedy mode for development
            if 'quick' in self.request.arguments() and req_counter >= 1:
                break
            if req_counter >= 500:
                logging.info('skipping remaining requests')
                break
            reqs[user_id] = {}
            # user_data is list of data_types in the SC API
            for data_type in user_data:
                # fire requests to SC API
                rpc = urlfetch.create_rpc(deadline=3)
                urlfetch.make_fetch_call(
                    rpc, SC_BASE_URL + user_id + '/' + data_type + SC_URL_END)
                reqs[user_id][data_type] = rpc
                # bump counter
                req_counter +=1
        logging.info('%s reqs out' % req_counter)

        # all requests are fired, start waiting for responses
        # resps = {}
        self.response.write('{')
        userComma = False
        for (user_id,req_dict) in reqs.iteritems():
            # resps[user_id] = {}
            if userComma: self.response.write(',')
            self.response.write('"%s": {' % user_id)
            itemComma = False
            for (data_type, rpc) in req_dict.iteritems():
                try:
                    result = rpc.get_result()
                    if result.status_code == 200:
                        if itemComma: self.response.write(',')
                        self.response.write('"%s":' % data_type)
                        self.response.write(result.content)
                        itemComma = True
                        # resps[user_id][data_type] = result.content # json.loads(result.content)
                except urlfetch.DownloadError, e:
                    # Request timed out or failed.
                    logging.info('error getting %s for user %s: %s' %
                        (data_type,user_id, str(e)))
                except apiproxy_errors.OverQuotaError, message:
                    logging.error(message)
                    break
            self.response.write('}')
            userComma = True
        self.response.write('}')
        logging.info('responses in')
        self.response.headers.add_header("Access-Control-Allow-Origin", "*")
        self.response.headers.add_header("Content-Type", "application/json")
        self.response.headers.add_header("Access-Control-Allow-Headers", "x-requested-with")
        # self.response.write(json.dumps(resps))



app = webapp2.WSGIApplication([
       webapp2.Route(r'/log', handler=LogHandler, name='log'),
       webapp2.Route(r'/showstats', handler=ShowStats, name='showstats'),
       webapp2.Route(r'/getData', handler=DataHandler, name='getData'),
       webapp2.Route(r'/getSounds', handler=SoundsHandler, name='getSounds'),
       webapp2.Route(r'/getFollowings', handler=FollowingsHandler, name='getFollowings'),
       ],debug=True)