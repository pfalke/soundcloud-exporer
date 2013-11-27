import webapp2
from google.appengine.ext import webapp
from google.appengine.ext import ndb
import jinja2

import logging
import os




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
        logging.info(self.request.arguments())
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
        logs = Log.query().fetch(1000)
        templ_val = {'logs': logs}
        template = JINJA_ENVIRONMENT.get_template('Logs.html')
        self.response.write(template.render(templ_val))



app = webapp2.WSGIApplication([
       webapp2.Route(r'/log', handler=LogHandler, name='log'),
       webapp2.Route(r'/showstats', handler=ShowStats, name='showstats'),
       ],debug=True)