import webapp2
from google.appengine.ext import ndb
from google.appengine.api import users

from google.appengine.runtime import apiproxy_errors

import jinja2

import logging
import os
import json
import urllib

from google.appengine.api import urlfetch


SC_BASE_URL = "https://api.soundcloud.com/users/"
SOUNDCLOUD_CLIENT_ID = '81d9704f45e2b1d224e791d20eb76d2f'
SOUNDCLOUD_CLIENT_SECRET = '4d33c7d194a23e781f184fb2418badae'



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

class LogHandler(webapp2.RequestHandler):
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


class DataHandler(webapp2.RequestHandler):
    def makeRequests(self):
        orders = json.loads(self.request.get('orders'))

        # parse options
        timeout=3 
        if 'timeout' in self.request.arguments():
            timeout = int(self.request.get('timeout'))

        req_counter = 0
        reqs = {}
        # for each user, get whatever is requested
        for (user_id, user_data) in orders.iteritems():
            # speedy mode for development
            if 'quick' in self.request.arguments() and req_counter >= 5:
                break # make only 5 reqs, for loacl testing
            if req_counter >= 500:
                logging.info('skipping remaining requests')
                break
            reqs[user_id] = {}
            # user_data is list of data_types in the SC API
            for data_type in user_data:
                # fire requests to SC API
                rpc = urlfetch.create_rpc(deadline=timeout)
                url = SC_BASE_URL + user_id + '/' + data_type + '.json?'
                if 'oauth_token' in self.request.arguments():
                    url += 'oauth_token=' + self.request.get('oauth_token') + '&'
                else:
                    url += 'client_id=' + SOUNDCLOUD_CLIENT_ID + '&'
                if 'limit' in self.request.arguments():
                    url += 'limit=' + str(self.request.get('limit'))
                if req_counter % 10 == 0:
                    logging.info(url) # log a few urls for error hunting
                urlfetch.make_fetch_call(rpc, url)
                reqs[user_id][data_type] = rpc
                req_counter +=1  # bump counter
        logging.info('%s reqs out' % req_counter)
        return reqs

    def extractRelevantData(self,entity, data_type):
        # Soundcloud API serves much more data than relevant
        # truncate to minimize load time
        relevant_data = {}
        relevant_keys = [ # if entity is a sound
            'id', 'created_at', 'permalink_url', 'artwork_url', 'title'
        ]
        if data_type == 'followings': # entity is a user
            relevant_keys = [
                'id', 'avatar_url', 'followings_count', 'full_name',
                'permalink', 'permalink_url', 'playlist_count', 
                'track_count', 'username'
            ]
        for item in relevant_keys:
            relevant_data[item] = entity[item]
        return relevant_data

    def extractFromApiCalls(self,reqs):
        # consolidate received sounds/users:
        # store relevant data for each and associate with original user
        kinds = {}
        connections = {}

        for (user_id,req_dict) in reqs.iteritems():
            connections[user_id] = []
            for (data_type, rpc) in req_dict.iteritems():
                try:
                    result = rpc.get_result()
                except urlfetch.DownloadError, e: # Request timed out or failed.
                    logging.info('error getting %s for user %s: %s' %
                        (data_type,user_id, str(e)))
                    continue
                except apiproxy_errors.OverQuotaError, message:
                    logging.error(message)
                    self.error(500)
                    self.response.write('Over quota. Please wait a few minutes and try again')
                    return
                if result.status_code != 200:
                    logging.error(result.content)
                    continue
                dataList = json.loads(result.content)
                # concatenate playlists into a list of sounds
                if data_type == 'playlists':
                    dataList = [sound for playlist in dataList for sound in playlist['tracks']]

                for entity in dataList:
                    try:
                        if entity['id'] not in kinds:
                            kinds[entity['id']] = self.extractRelevantData(entity, data_type)
                        # associate with user
                        connections[user_id].append(entity['id'])
                    except Exception, e:
                        logging.error('skipping sound/user because of error: %s' % e)
                        logging.error(entity)                    
        return (kinds, connections)

    def post(self):
        self.response.headers.add_header("Access-Control-Allow-Origin", "*")
        self.response.headers.add_header("Content-Type", "application/json")
        self.response.headers.add_header("Access-Control-Allow-Headers", "x-requested-with")

        requests = self.makeRequests()

        kinds, connections = self.extractFromApiCalls(requests)

        logging.info('responses parsed, write JSON')
        self.response.write(json.dumps({
            'kinds': kinds,
            'connections': connections,
            }))
        logging.info('done')


class SignRequestHandler(webapp2.RequestHandler):
    def post(self):
        self.response.headers.add_header("Access-Control-Allow-Origin", "*")
        self.response.headers.add_header("Content-Type", "application/json")

        redirect_uri = self.request.get('SOUNDCLOUD_OAUTH_REDIRECT_URL')
        client_id = SOUNDCLOUD_CLIENT_ID
        client_secret = SOUNDCLOUD_CLIENT_SECRET
        logging.info(redirect_uri)
        if 'localhost' in redirect_uri:
            client_id = 'f90fa65cc94d868d957c0b529c5ecc3d'
            client_secret = '9a7b216fc0874d85e1f9193f572146ac'

        # request acess token from soundcloud
        form_fields = {
            "code": self.request.get('code'),
            "grant_type": "authorization_code",
            'client_id': client_id,
            'client_secret': client_secret,
            'redirect_uri': redirect_uri,
        }
        form_data = urllib.urlencode(form_fields)
        result = urlfetch.fetch(url='https://api.soundcloud.com/oauth2/token',
            payload=form_data,
            method=urlfetch.POST,
            headers={'Content-Type': 'application/x-www-form-urlencoded'})
        if result.status_code == 200:
            self.response.write(result.content)
            return
        logging.error(result.content)
        self.error(result.status_code)

app = webapp2.WSGIApplication([
       webapp2.Route(r'/showstats', handler=ShowStats, name='showstats'), # Admin only
       webapp2.Route(r'/s/log', handler=LogHandler, name='log'),
       webapp2.Route(r'/s/getSounds', handler=DataHandler, name='getSounds'),
       webapp2.Route(r'/s/getFollowings', handler=DataHandler, name='getFollowings'),
       webapp2.Route(r'/s/signRequest', handler=SignRequestHandler, name='signRequest'),
       ],debug=True)