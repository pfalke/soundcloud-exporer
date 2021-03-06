/*jshint asi: true*/

var logging = {
	'calls': true,
	'interactions': false,
	'redraws': false,
}

$(document).ready(function() {
	// parameters for soundcloud
	SOUNDCLOUD_CLIENT_ID = '7eb64bef7b9f650a6677ae6a2c2b32e3'
	SOUNDCLOUD_OAUTH_REDIRECT_URL = 'https://soundcloud-explore.appspot.com/'
	// parameters for testing on local machine
	if (document.domain.indexOf('localhost') != -1) {
		SOUNDCLOUD_CLIENT_ID = '007702ed0fe9da4d2bc12d3a25ae7dcb'
		SOUNDCLOUD_OAUTH_REDIRECT_URL = 'http://localhost:16081/'
	}

	// var BACKEND_URL = '/s'
	var BACKEND_URL = 'https://soundcloud-explore.appspot.com/s'




	// CREATE GRAPH OUTPUT
	// user choices
	var degreeConsidered = 1 // selected by explorer: users up to this degree are considered
	$('.degreeButton').click(function(el) {
		degreeConsidered = $(this).attr('degree')
		determineGraphNodes()

		// color buttons
		$('.degreeButton').each(function(i, btn) {
			if (!($(btn).attr("disabled"))) {
				$(btn).removeClass('btn-primary').addClass('btn-warning')
			}
		})
		$(this).removeClass('btn-warning').addClass('btn-primary')
	})

	// true: display only sounds that are not connected to root user
	var keepFresh = false
	$('#keepFresh').change(function() {
		keepFresh = $(this).prop('checked')
		if (logging.interactions) {console.log(keepFresh)}
		determineGraphNodes()
	})

	// true: display only users that are not connected to root user
	var newPeople = false
	$('#newPeople').change(function() {
		newPeople = $(this).prop('checked')
		if (logging.interactions) {console.log(newPeople)}
		determineGraphNodes()
	})

	// exclude old tracks. fresh is 3 months, hot is 3 weeks
	var now = new Date()
	var maxAge = 100000// in days
	$('#dateRangeButtons button').click(function(e) {
		// unselect default button
		$('#btnDateAny').removeClass('active')
		var dateRange = $(this).attr('dateRange')
		if (dateRange == 'hot') {maxAge = 21}
		else if (dateRange == 'fresh') {maxAge = 90}
		else {maxAge = 10000}
		if (logging.interactions) {console.log('maxAge is now ' + maxAge)}
		// redraw graph
		determineGraphNodes()
	})



	// UI
	
	function writeListsInDashboard(soundList, userList) {
		var theList = document.createDocumentFragment()
		var entryTemplate = document.createDocumentFragment()
		var li = document.createElement("li")
		li.className = 'soundInList'
		var thumb = document.createElement('img')
		thumb.className = 'contentThumb'
		thumb.height = 100
		thumb.width = 100
		li.appendChild(thumb)
		var title = document.createElement('a')
		title.className = 'contentName'
		title.target = '_blank'
		li.appendChild(title)
		entryTemplate.appendChild(li)
		$.each(soundList, function writeList(index, sound) {
			var entry = entryTemplate.cloneNode(true)
			entry.querySelector('.contentThumb').src = sound.soundData.artwork_url
			entry.querySelector('.contentName').innerHTML = sound.soundData.title
			entry.querySelector('.contentName').href = sound.soundData.permalink_url
			theList.appendChild(entry)
		})
		document.getElementById('soundsInGraph').innerHTML = ''
		document.getElementById('soundsInGraph').appendChild(theList)
		//userList
		theList = document.createDocumentFragment()
		$.each(userList, function writeList(index, user) {
			var entry = entryTemplate.cloneNode(true)
			entry.querySelector('.contentThumb').src = user.userData.avatar_url
			var name = user.userData.username
			if (user.userData.full_name && user.userData.full_name != name) {
				name += ' (' + user.userData.full_name + ')'
			}
			entry.querySelector('.contentName').innerHTML = name
			entry.querySelector('.contentName').href = user.userData.permalink_url
			$('<a user_id="' + user.userData.id + '" href="/' + user.userData.permalink +
				'" class="label label-warning userlink" style="margin-left:5px;">View graph</a>')
				.click(switchToUserOnClick)
				.appendTo(entry.querySelector('li'))
			theList.appendChild(entry)
		})
		document.getElementById('usersInGraph').innerHTML = ''
		document.getElementById('usersInGraph').appendChild(theList)
	}

	// input is graph in '->' form, send this to halfviz
	function updateGraph(src_text) {
        var network = parse(src_text)
        $.each(network.nodes, function(nname, ndata){
          if (ndata.label===undefined) ndata.label = nname
        })
        sys.merge(network)
        _updateTimeout = null
        // display text in input area
        $("#halfviz").find('textarea').val(src_text)
	}

	// prepare graph as string: [user] -> [sound]
	function writeGraphSrcNew(goodSounds, goodUsers) {
		var graphSrc = ''
		// create list of users for easier iteration
		var userList = []
		var soundList = []
		$.each(goodUsers, function(i, guObj) {
			userList.push(guObj.user)
		})
		// write edges
		$.each(goodSounds, function(i, gsObj) {
			var sound = gsObj.sound
			soundList.push(sound)
			graphSrc += sound.soundData.title + ' {color:#f60}\n' // sound nodes have orange background
			// connect users to this node
			$.each(gsObj.connectedUsers, function(j, user) {
				if (userList.indexOf(user) == -1)
					{return}
				graphSrc += user.userData.username + ' -> ' + sound.soundData.title + '\n'
			})
		})

		graphSrc += users[rootID].userData.username + ' {color:blue}\n'

		// pass the source to the parser
		updateGraph(graphSrc)
		writeListsInDashboard(soundList,userList)
	}

	// get sounds that have high enough degree for the graph
	function getGoodSounds() {
		var goodSounds = []
		for (var soundId in sounds) {
			var sound = sounds[soundId]
			// criteria for inclusion of sound:
			// (if keepFresh only sounds not connected to root user)
			// sound must not be too old
			var good = (sound.ageDays <= maxAge &&
				(!keepFresh || !sound.isCool))
			if (!good)
				{continue}
			// we later rank sounds by number of connected users below degreeConsidered
			var connectedUsers = sound.getConnectedUsersAtDegree(degreeConsidered)
			goodSounds.push({
				'sound': sound,
				'connectedUsers': connectedUsers,
			})
		}
		console.log('there are ' + goodSounds.length + ' sounds in store')
		return goodSounds
	}

	function getGoodUsers(goodSounds) {
		var userCounts = {}
		var user, i, j
		for (i=0; i<goodSounds.length; i++) {
			var conUsers = goodSounds[i]['connectedUsers']
			for (j=0; j<conUsers.length; j++) {
				user = conUsers[j]
				if (!(user.id in userCounts))
					{userCounts[user.id] = {
						'count': 0,
						'user': user
					}}
				userCounts[user.id]['count'] +=1
			}
		}
		// if chosen by explorer, no users followed by root user are displayed. delete them from the counts
		if (newPeople) {
			for (j=0; j<users[rootID].followings.length; j++) {
				user = users[rootID].followings[j]
				if (user.id in userCounts)
					{delete userCounts[user.id]}
			}
		}

		// convert to Array so it can be sorted later
		var goodUsers = []
		for (var userId in userCounts) {
			goodUsers.push({
				'user': userCounts[userId]['user'],
				'count': userCounts[userId]['count']
			})
		}
		return goodUsers
	}


	// returns list of sounds to be included in graph and
	// dict giving how many of these sounds each user is connecteed to
	var determineGraphNodes = function() {
		var now = new Date()

		var goodSounds = getGoodSounds()

		// include the 15 sounds with the most connections into the graph
		// sort goodSounds by number of connections
		goodSounds.sort(function(a, b) {return a['connectedUsers'].length - b['connectedUsers'].length})
		goodSounds = goodSounds.slice(-15)
		goodSounds.reverse()

		var goodUsers = getGoodUsers(goodSounds)
		goodUsers.sort(function(a, b) {return a['count'] - b['count']})
		goodUsers = goodUsers.slice(-30)
		goodUsers.reverse()

		writeGraphSrcNew(goodSounds, goodUsers)

		var then = new Date()
		if (logging.redraws)
			{console.log('took ' + (then-now) + 'ms to determine graph')}
	}











	// MANAGE GRAPH DATA

	var finalDegree = 4 // how much data to fetch (degrees of separation from root user)

	var users = {} // the users that have been processed, indexed by ID
	var sounds = {} // the tracks that have been sighted, indexed by ID
	var rootID = 'pfalke' // soundcloud id of the root user for tree

	var dataTypes = {
		'connectedUsers': ['followings'],
		'sounds': ['favorites', 'tracks', 'playlists']
	}

	// a user, local copy of data pulled from Soundcloud
	function User(id, degree, userData) {
		this.id = id
		this.degree = degree // degree of separation from root user in graph

		if (userData) // big object from SC API
			this.userData = userData

		this.queried = {
			'sounds': false,
			'connectedUsers': false
		}

		this.sounds = [] // favorites, tracks, etc
		this.followings = []

		this.numCoolSounds = 0 // sounds in common with root user
	}

	function Sound(id, sound_obj) {
		this.id = id
		if (sound_obj)
			{this.soundData = sound_obj}

		// users that have liked, shared this sound
		this.allConnectedUsers = []

		// sounds liked by the current root user are cool
		this.isCool = false

		// creation date on Soundcloud, age in days
		this.created = new Date(sound_obj.created_at)
		this.ageDays = Math.floor((now - this.created)/1000/60/60/24)

		// returns list of users up to given degree have favorited etc this sound
		this.getConnectedUsersAtDegree = function(degree) {
			var connectedUsers = []
			for (var i=0; i<this.allConnectedUsers.length; i++) {
				var user = this.allConnectedUsers[i]
				if (user.degree<=degree)
					{connectedUsers.push(user)}
			}
			return connectedUsers
		}
	}

	// GAE app returns for each user a list of sound.
	// this methods connects our corresponding data objects
	function associateUserWithSounds(user_id, soundList) {
		var user = users[user_id]
		user.queried.sounds = true
		for (var i = 0; i<soundList.length; i++) {
			var sound = sounds[soundList[i]]
			if (user.sounds.indexOf(sound) == -1)
				{user.sounds.push(sound)}
			if (sound.allConnectedUsers.indexOf(user) == -1)
				{sound.allConnectedUsers.push(user)}

			// sounds in common with root user are cool
			if (sound.isCool) {
				user.numCoolSounds +=1
			}
		}
	}


	function DataRetrieval() {
		var stop = false // set this flag to stop callbacks from executing
		this.stop = function() {
			stop = true
		}

		// for which users <= degree we haven't queried this dataType
		function loadDataAtMaxDegree(dataType, degree) {
			// outside functions can set this flag, e.g. when root user changes and new search is started
			if (stop) {
				return
			}
			var user, dataForUser
			var idsToQuery = {}
			var batches = [] // we request at most 200 objects from API at a time
			var counterAPI = 0
			for (var userId in users) {
				user = users[userId]
				// check if degree OK and we have not queried this data for this user before
				// check connected users only if user has enough cool sounds (more than his degree)
				var userGood = (!user.queried[dataType] && user.degree<=degree &&
					(dataType == 'sounds' || user.numCoolSounds>user.degree))
				if (!userGood) {
					continue
				}
				idsToQuery[userId] = [] // list of things to request from API
				for (var i = 0; i<dataTypes[dataType].length; i++) {
					var currDataType = dataTypes[dataType][i]
					// no request needs to be made if we know there is no data
					// not sure how non-public favorites are handled, so make request anyway for small degrees
					var skip = ((currDataType == 'playlists' && user.userData.playlist_count === 0) ||
						(currDataType == 'favorites' && user.userData.public_favorites_count < 5 && degree>1) ||
						(currDataType == 'tracks' && user.userData.track_count < 5) ||
						(currDataType == 'followings' && user.userData.followings_count < 5))
					if (skip) {
						continue
					}
					// get from API
					idsToQuery[userId].push(currDataType)
					counterAPI +=1
				}

				// requests are split in batches of ~50 to make load easier to handle for GAE
				if (counterAPI>=50) {
					batches.push(idsToQuery)
					idsToQuery = {}
					counterAPI = 0
				}
			}

			if (counterAPI>0) {batches.push(idsToQuery)}

			getData(batches, dataType, degree)
		}

		// for which users <= degree we haven't queried this dataType
		function loadConnectionsAtMaxDegree(dataType, degree) {
			// outside functions can set this flag, e.g. when root user changes and new search is started
			if (stop) {
				return
			}

			var userCount = 0
			var goodUsers = []
			for (var userId in users) {
				userCount +=1
				var user = users[userId]
				// check if degree OK and we have not queried this data for this user before
				// a user at the higher degrees should have a few common likes with root user
				// users with too few followings are not worth an API call
				// users with too many followings: cannot process all of them, data not meaningful
				var userGood = (!user.queried.connectedUsers && user.degree<=degree &&
					user.numCoolSounds >= degree*2 &&
					((user.userData.followings_count > 3 && user.userData.followings_count<150) ||
						degree === 0))
				if (userGood) {
					goodUsers.push(user)
				}
			}
			console.log('there are ' + userCount + ' users stored now')
			console.log(goodUsers.length + ' of them are eligible')

			// we want to have the users with the most sounds in common with the root user
			goodUsers.sort(function(a, b) {return a.numCoolSounds - b.numCoolSounds})
			goodUsers = goodUsers.slice(-15)
			if (goodUsers.length > 0)
				{console.log('user with least cool sounds that is considered has ' +
					goodUsers[0].numCoolSounds + ' cool sounds')}

			var idsToQuery = {}
			$.each(goodUsers, function(j, user) {
				idsToQuery[user.id] = ['followings']
				console.log(user.numCoolSounds + ' has followings: ' + user.userData.followings_count +
					', username: ' + user.userData.username)
			})

			getData([idsToQuery], 'connectedUsers', degree)
		}

		function getData(batches, dataType, degree) {
			var now = new Date()
			if (logging.calls)
				{console.log('order '+ batches.length + ' batches for ' + dataType)}
			var unfinishedRequests = 0

			var url = BACKEND_URL + '/getSounds'
			if (dataType == 'connectedUsers')
				{url = BACKEND_URL + '/getFollowings'}

			var dataLoaded = {
				'kinds': {}, // either the sounds or the users
				'connections': {} // {user: [sound_id, sound_id, ...]} or equiv for followings
			}

			// sometimes all data is already in memory, i.e. batches == []
			// then, immediate start processing, no requests need to be made
			if (!batches.length) {
				console.log('nothing to load, skip call to server (' + dataType + ')')
				processData(dataLoaded, dataType, degree)
			}

			$.each(batches, function(i, batch) {
				unfinishedRequests +=1
				var data = {
					'orders' : JSON.stringify(batch),
					'limit': '50', // results per API call
					'timeout': degree > 0 ? '3' : '8' // root user's data is more important
				}
				if (localStorage.accessTokenSC) // API calls with token may return private data
					{data['oauth_token'] = localStorage.accessTokenSC}
				if (BACKEND_URL.indexOf('appspot') == -1 && location.href.indexOf('appspot') == -1)
					{data['quick'] = 'x'} // parameter "quick": for local testing, backend only does <5 requests
				var success = function ajaxSucess(resp) {
						// combine with data from other API calls
						dataLoaded = mergeReceivedData(dataLoaded, resp)
						unfinishedRequests -=1
						if (unfinishedRequests)
							{return}
						if (logging.calls) {
							var then = new Date()
							console.log('took ' + (then-now) + 'ms to get data')
						}
						processData(dataLoaded, dataType, degree)
				}
				var error = function ajaxError(jqXHR, stats, err) {
					console.log(jqXHR.responseText)
					unfinishedRequests -=1
					if (!unfinishedRequests) {
						processData(dataLoaded, dataType, degree)
					}
				}
				$.ajax({
					type: "POST",
					url: url,
					data: data,
					success: success,
					dataType: 'json',
					error: error
				});
			})
		}

		function mergeReceivedData(dataLoaded, recData) {
			dataLoaded.kinds = $.extend({}, dataLoaded.kinds, recData.kinds)
			dataLoaded.connections = $.extend({}, dataLoaded.connections, recData.connections)
			return dataLoaded
		}

		function processData(dataLoaded, dataType, degree) {
			// process assembled data
			if (dataType == 'sounds') {storeSound(dataLoaded, degree)}
			else if (dataType == 'connectedUsers') {storeConnection(dataLoaded, degree)}
		}

		// create Sound object for newly found songs, associate sounds with
		// User objects, signal that sounds were loaded
		function storeSound(dataLoaded, degree) {
			var now = new Date()

			// store all newly received sounds
			$.each(dataLoaded.kinds, function(id, soundData) {
				if (!(id in sounds))
					{sounds[id] = new Sound(id, soundData)}
			})

			// associate the users with their connected sounds
			$.each(dataLoaded.connections, associateUserWithSounds)

			var then = new Date()
			console.log('took ' + (then-now) + 'ms to store sounds at degree ' + degree)

			// we're done with this degree. update buttons and graph as fit
			// enable button for this degree to allow user to look at data
			if (degree>1) {
				$('#btnDegree'+degree).addClass('btn-warning').removeAttr('disabled')
			}

			// rewrite graph unless we only have data for root user
			if (degree < 2) {
				determineGraphNodes()
			}

			if (degree > 0) {
				$('#btnDegree'+degree).removeClass('loading')
			}

			if (degree === 0) {
				// check the already loaded users for sounds common with root user
				checkCoolSounds()
			}

			// start retrieving connectedUsers unless we reached finalDegree
			if (degree<finalDegree) {
				loadConnectionsAtMaxDegree('connectedUsers',degree)
				// loadDataAtMaxDegree('connectedUsers',degree)
				$('#btnDegree'+(degree+1)).addClass('loading')
			}
		}

		// create User object for newly found users, associate users amongst each other,
		// signal that users were loaded
		function storeConnection(dataLoaded, degree) {
			var now = new Date()

			// store all newly received sounds
			$.each(dataLoaded.kinds, function(id, userData) {
				if (!(id in users))
					{users[id] = new User(id, degree+1, userData)}
			})

			// associate the users with their followings
			$.each(dataLoaded.connections, function(user_id, followingList) {
				var user = users[user_id]
				user.queried.connectedUsers = true
				for (var i = 0; i<followingList.length; i++) {
					var otherUser = users[followingList[i]]
					user.followings.push(otherUser)

					// update degree if necessary
					if (otherUser.degree > user.degree +1) {
						console.log('update degree from ' + otherUser.degree + '  to ' + (user.degree+1))
						otherUser.degree = user.degree+1
					}
				}
			})

			// above we have only set the degree for followings of newly loaded users.
			// now set degree for existing users
			setDegree(degree)
			// start retrieving sounds unless we reached finalDegree
			loadDataAtMaxDegree('sounds' ,degree+1)
		}
		
		// kick off retrieving data
		loadDataAtMaxDegree('sounds', 0)
	}

	function checkCoolSounds() {
		// mark root users sounds
		$.each(users[rootID].sounds, function(id, sound) {
			sound.isCool = true
			for (var i=0; i<sound.allConnectedUsers.length; i++) {
				sound.allConnectedUsers[i].numCoolSounds +=1
			}
		})
	}

	// make sure the followings of a given degree are set to <=degree+1
	function setDegree(degree) {
		for (var user_id in users) {
			var user = users[user_id]
			if (user.degree != degree)
				{continue}
			// make sure all followings are of degree <=degree+1
			for (var i = 0; i<user.followings.length; i++) {
				if (user.followings[i].degree>degree+1)
					{user.followings[i].degree = degree+1}
			}
		}
	}

	function getScAccessToken(oauthCode) {
		$.post('/s/signRequest', {
			'code': oauthCode,
			'SOUNDCLOUD_OAUTH_REDIRECT_URL': SOUNDCLOUD_OAUTH_REDIRECT_URL
		}).fail(function reqFail(data, status, jqXHR) {console.log(data)})
		.done(function reqDone(data, status, jqXHR) {
			// store token
			if (typeof(data) == 'string')
				{data = JSON.parse(data)
				console.log('had to parse')
				}
			if (typeof(data) == 'object' && 'access_token' in data) {
				localStorage.accessTokenSC = data['access_token']
				startWithOAuthUser()
			} else {console.log(data)}
		})
		// remove code from displayed url
		var url = location.protocol+'//'+location.hostname+
			(location.port ? ':'+location.port: '')+'/'
		history.pushState({id: 'oauth_code'}, '', url);
	}

	// USER INTERACTIONS etc
	function startWithOAuthUser() {
		// retrive accessToken from localStorage
		var accessTokenSC = localStorage.accessTokenSC
		// when redirected form SC oauth dialog
		var oauthCode = getParameterByName('code')
		if (accessTokenSC) {
			// we are authorized
			startWithId('me', accessTokenSC)
		} else if (!accessTokenSC && oauthCode) {
			// get accessToken, then restart
			getScAccessToken(oauthCode)
			return
		} else {
			// splashpage prompt user to authorize on SC
			location.href = '/splashpage'
		}
	}

	function logVisit(userJSON) {
		$.post('/s/log',userJSON)
	}

	// get a URL query paramter. used to extract oauth code
	function getParameterByName(name) {
		// name = name.replace(/[\[]/, "\\\[").replace(/[\]]/, "\\\]");
		var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
			results = regex.exec(location.search);
		return results === null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
	}

	function getRootUserData(id, accessTokenSC) {
		var url = 'https://api.soundcloud.com/users/'+id+'.json?client_id='+SOUNDCLOUD_CLIENT_ID
		if (id == 'me' && accessTokenSC) {
			url = "https://api.soundcloud.com/me.json?oauth_token=" + accessTokenSC
		}
		$.getJSON(url).done(function(user) {
			if (logging.calls) {console.log('got data for root user: ' + user.username)}
			users[user.id] = new User(user.id, 0, user)

			// log visits of logged in users to their own tree
			if (id == 'me' && accessTokenSC) {
				logVisit(user)
				// store username locally so back button can always be displayed
				localStorage.oauth_username = user.username
				localStorage.oauth_user_id = user.id
			}

			// start algorithm
			startWithId(user.id)
		})
	}

	function startWithId(id, accessTokenSC) {
		// load data first - may later not be necessary if we already found the user in some other tree
		if (!(id in users)) {
			getRootUserData(id, accessTokenSC)
			return
		}
		var rootUser = users[id]
		console.log("\n\n\nStart graph search for user " + rootUser.userData.username)
		$('#rootUserInDashboard').text('- based on user ' + rootUser.userData.username).show()
		rootID = id
		rootUser.degree = 0
		// start retrieving data. global variable so it can be stopped
		window.currDataRetrieval = new DataRetrieval()
		// URL for sharing
		var newurl = location.protocol+'//'+location.hostname+
			(location.port ? ':'+location.port: '')+'/'+rootUser.userData.permalink
		history.pushState({id: rootUser.userData.permalink}, '', newurl);

		// show button for Connect to Soundcloud if not connected
		if (!localStorage.accessTokenSC) { // user not logged in
			$('#oauthButton').show()
			$('#goToOAuthUserButton').hide()
		} else if (localStorage.oauth_username && rootUser.userData.username != localStorage.oauth_username) {
			// user logging in and browsing someone else's account
			$('#oauthButton').hide()
			$('#goToOAuthUserButton').attr('user_id',localStorage.oauth_user_id).show()
			.find('button').text('Back to ' + localStorage.oauth_username)

		} else { // user logged in and exploring own account
			$('#oauthButton').hide()
			$('#goToOAuthUserButton').hide()
		}
	}

	function start() {
		if (location.pathname.length > 1) {
			// if path is something like "/pfalke", start with user 'pfalke'
			var pathArray = window.location.pathname.split( '/' )
			var id = (pathArray[0] === '') ? pathArray[1] : pathArray[0]
			console.log('guessing user id is ' +id)
			startWithId(id)
		} else {
			startWithOAuthUser()
			console.log('going with oauth')
		}
	}




	// START HERE
	// display "Loading"
    var mcp = HalfViz("#halfviz")
    updateGraph('Loading -> Your Data \n Your Data -> This can take \n This can take -> a few minutes')
	// resize window to trigger the start of rendering
	setTimeout(function() {	$(window).resize()},500)
	setTimeout(function() {	$(window).resize()},1500)
	setTimeout(function() {	$(window).resize()},3500)
	setTimeout(function() {	$(window).resize()},7500)

	start()

	// clicking on a list item in the dashboard starts graph for that user
	function switchToUserOnClick(e) {
		e.preventDefault()
		// stop the current search
		window.currDataRetrieval.stop()

		// reset everything dependent on the root user
		$.each(users, function(user_id, user) {
			user.degree = 999
			user.numCoolSounds = 0
		})
		$.each(sounds, function(sound_id, sound) {
			sound.isCool = false
		})

		// reset Degree Buttons
		degreeConsidered = 1
		$('.degreeButton').removeClass('loading').removeClass('btn-primary')
		.removeClass('btn-warning').prop('disabled')
		$('#btnDegree1').removeAttr('disabled').removeClass('btn-warning').addClass('btn-primary').addClass('loading')

		startWithId(this.getAttribute('user_id'))
	}

	$('#goToOAuthUserButton').click(switchToUserOnClick)
	$('#created-by').tooltip()
	$('.degreeButton').tooltip({delay: { show: 200, hide: 100 }})
	$('.tooltipped').tooltip({delay: { show: 200, hide: 100 }})
})