/*jshint asi: true*/

$(document).ready(function() {
	// parameters for soundcloud
	SOUNDCLOUD_CLIENT_ID = '81d9704f45e2b1d224e791d20eb76d2f'
	SOUNDCLOUD_OAUTH_REDIRECT_URL = 'https://soundcloud-explore.appspot.com/'
	SOUNDCLOUD_CLIENT_SECRET = '4d33c7d194a23e781f184fb2418badae'
	// parameters for testing on local machine
	if (document.domain.indexOf('localhost') != -1) {
		SOUNDCLOUD_CLIENT_ID = 'f90fa65cc94d868d957c0b529c5ecc3d'
		SOUNDCLOUD_OAUTH_REDIRECT_URL = 'http://localhost:16081/'
		SOUNDCLOUD_CLIENT_SECRET = '9a7b216fc0874d85e1f9193f572146ac'
	}

	var dataUrl = 'https://soundcloud-explore.appspot.com/getData'
	// var dataUrl = '/getData'





	// CREATE GRAPH OUTPUT
	var minConnectedUsers = 8 // how many connected users a sound needs to have to be relevant/displayed
	var minRelevantSounds = 3 // how many relevant sounds a user needs to be connected to to be displayed

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
		keepFresh = ($(this).attr('checked') == 'checked')
		determineGraphNodes()
	})

	// true: display only users that are not connected to root user
	var newPeople = false
	$('#newPeople').change(function() {
		newPeople = ($(this).attr('checked') == 'checked')
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
		console.log('maxAge is now ' + maxAge)
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
			$('<a href="/' + user.userData.permalink + '" class="label label-warning" style="margin-left:5px;">View graph</a>')
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
	function writeGraphSrc(soundList, userCounts) {
		// write edges
		var graphSrc = ''
		var userList = []
		$.each(soundList, function(index, sound) {
			// check which users to connect to the node
			$.each(sound.connectedUsersAtDegree(degreeConsidered), function(i, user) {
				graphSrc += sound.soundData.title + ' {color:#f60}\n' // sound nodes have orange background
				if (userCounts[user.userData.id]>= minRelevantSounds) {
					graphSrc += user.userData.username + ' -> ' + sound.soundData.title + '\n'
					// add user to list 
					if (userList.indexOf(user) == -1) {userList.push(user)}
				}
			})
		})

		// pass the source to the parser
		updateGraph(graphSrc)
		writeListsInDashboard(soundList,userList)
	}

	// returns list of sounds to be included in graph and dict giving how many of these sounds each user is connecteed to
	var determineGraphNodes = function() {
		var now = new Date()
		// check how often each user appers - don't want users that appear only once
		var soundsInGraph
		var userCounts
		var bumpUserCount = function(index, user) {
			var id =user.userData.id
			if (id in userCounts) {
				userCounts[id] +=1
			} else {
				userCounts[id] = 1
			}
		}

		// get sounds that have high enough degree for the graph
		function getSoundsForGraphAndUserCounts() {
			soundsInGraph = []
			userCounts = {}
			for (var soundId in sounds) {
				// criteria for inclusion of sound:
				// (if keepFresh only sounds not connected to root user)
				// sound needs to have enough connected users below degreeConsidered
				// sound must not be too old
				if (sounds[soundId].ageDays <= maxAge &&
					(!keepFresh || users[rootID].sounds.indexOf(sounds[soundId])== -1) &&
					sounds[soundId].connectedUsersAtDegree(degreeConsidered).length>=minConnectedUsers) {
					soundsInGraph.push(sounds[soundId])
					// bump count for each user associated with sound
					$.each(sounds[soundId].connectedUsersAtDegree(degreeConsidered), bumpUserCount)
				}
			}
		}

		getSoundsForGraphAndUserCounts()

		// there should be 5-15 sounds in the graph. adjust parameters as long as it makes sense
		while (soundsInGraph.length> 15 && minConnectedUsers<25) {
			minConnectedUsers +=1
			console.log('increased nodeDegree to '+ minConnectedUsers +
				', had ' + soundsInGraph.length + ' sounds')
			getSoundsForGraphAndUserCounts()
		}
		while (soundsInGraph.length< 5 && minConnectedUsers>3) {
			minConnectedUsers -=1
			console.log('decreased nodeDegree to '+ minConnectedUsers +
				', had ' + soundsInGraph.length + ' sounds')
			getSoundsForGraphAndUserCounts()
		}

		// if active, no users followed by root user are displayed. Therefore make their userCounts 0
		if (newPeople) {
			for (var j=0; j<users[rootID].followings.length; j++) {
				userCounts[users[rootID].followings[j].id] = 0
			}
		}
	
		// there should be 5-15 users in the graph. adjust parameters as long as it makes sense
		var bigUsers
		var computeNumerBigUsers = function() {
			bigUsers = 0
			for (var i in userCounts) {
				// criteria for user to be displayed:
				// connected to enough relevant sound and (if active) not followed by root user
				// (!newPeople || users[rootID].followings.indexOf(users[i]) == -1)
				if (userCounts[i]>minRelevantSounds) {bigUsers+=1}
			}
		}
		computeNumerBigUsers()
		while (bigUsers<5 && minRelevantSounds>1) {
			minRelevantSounds -=1
			computeNumerBigUsers()
		}
		while (bigUsers>8 && minRelevantSounds<15) {
			minRelevantSounds +=1
			computeNumerBigUsers()
		}

		writeGraphSrc(soundsInGraph, userCounts)
		// update again in .5 sec
		// setTimeout(writeGraphSource, 800)
		var then = new Date()
		console.log('took ' + (then-now) + 'ms to determine graph with ' + soundsInGraph.length + ' sounds')
	}











	// MANAGE GRAPH DATA

	var finalDegree = 4 // how much data to fetch (degrees of separation from root user)

	var users = {} // the users that have been processed, indexed by ID
	var sounds = {} // the tracks that have been sighted, indexed by ID
	var rootID = 'pfalke' // soundcloud id of the root user for tree

	var dataTypes = {
		'connectedUsers': ['followings'],
		'sounds': ['favorites', 'tracks']
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
		this.followers = []
		this.followings = []

		this.coolSounds = [] // sounds in common with root user
	}

	function Sound(id, sound_obj) {
		this.id = id
		if (sound_obj) this.soundData = sound_obj
		this.connectedUsers = {
			'0': [], // users at degree ... that have favorited etc this sound
			'1': [],
			'2': [],
			'3': [],
			'4': [],
		}

		// creation date on Soundcloud, age in days
		this.created = new Date(sound_obj.created_at)
		this.ageDays = Math.floor((now - this.created)/1000/60/60/24)

		// returns list of users up to given degree have favorited etc this sound
		this.connectedUsersAtDegree = function(degree) {
			var connectedUsers = []
			for (var i=0; i<=degree; i++) {
				connectedUsers = connectedUsers.concat(this.connectedUsers[i])
			}
			return connectedUsers
		}
	}

	// create Sound object for newly found songs, associate sounds with User objects, signal that sounds were loaded
	function storeSounds(dataLoaded, degree) {
		var now = new Date()
		// var resp = JSON.parse(soundJSON)
		var user, data, soundObj, soundType, soundList, i
		for (var userId in dataLoaded) {
			// mark the user as queried
			user = users[userId]
			user.queried.sounds = true
			data = dataLoaded[userId]
			// iterate all lists (favorites, tracks)
			for (soundType in data) {
				soundList =  data[soundType] // JSON.parse(data[soundType])//
				for (i= 0; i<soundList.length; i++) {
					soundObj = soundList[i]
					// create new sound if it doesn't exist
					if (!(soundObj.id in sounds)) {
						sounds[soundObj.id] = new Sound(soundObj.id, soundObj)
					} else {
						// console.log('sound exists')
					}
					// associate sound object with user and vice versa
					user.sounds.push(sounds[soundObj.id])
					sounds[soundObj.id].connectedUsers[degree].push(user)

					// sounds in common with root user are cool
					if (users[rootID].sounds.indexOf(sounds[soundObj.id])>=0) {
						user.coolSounds.push(sounds[soundObj.id])
					}
				}
			}
		}
		// var then = new Date()
		// console.log('took ' + (then-now) + 'ms to store sounds')

		// we're done with this degree. update buttons and graph as fit
		// enable button for this degree to allow user to look at data
		if (degree>1) {
			$('#btnDegree'+degree).addClass('btn-warning').removeAttr('disabled')
		}
		// start retrieving connectedUsers unless we reached finalDegree
		if (degree<finalDegree) {
			loadDataAtMaxDegree('connectedUsers' ,degree)
			$('#btnDegree'+(degree+1)).addClass('loading')
		}

		// rewrite graph unless we only have data for root user
		if (degree>0) {
			determineGraphNodes()
			$('#btnDegree'+degree).removeClass('loading')
		}
	}

	// create User object for newly found users, associate users amongst each other, signal that users were loaded
	function storeConnections(dataLoaded, degree) {
		var now = new Date()
		// var resp = JSON.parse(usersJSON)
		var userId, user, data, dataObj, dataType, dataList, i, otherType
		for (userId in dataLoaded) {
			// mark the user as queried, delete references that were made so far to avoid duplicates
			user = users[userId]
			user.queried.connectedUsers = true
			user.followings = []
			user.followers = []
			data = dataLoaded[userId]
			// iterate all lists (favorites, tracks)
			for (dataType in data) {
				otherType = (dataType == 'followers') ? 'followings' : 'followers'
				dataList = data[dataType] // JSON.parse(data[dataType]) // 
				for (i= 0; i<dataList.length; i++) {
					dataObj = dataList[i]
					// create new user if it doesn't exist
					if (!(dataObj.id in users)) {
						users[dataObj.id] = new User(dataObj.id, degree+1, dataObj)
					}
					// associate users with each other
					user[dataType].push(users[dataObj.id])
					users[dataObj.id][otherType].push(user)
				}
			}
		}
		var then = new Date()
		// console.log('took ' + (then-now) + 'ms to store connections')

		// start retrieving sounds unless we reached finalDegree
		loadDataAtMaxDegree('sounds' ,degree+1)
	}

	// for which users <= degree we haven't queried this dataType
	function loadDataAtMaxDegree(dataType, degree) {
		var user, dataForUser
		var idsToQuery = {}
		var counterCache = 0, counterAPI = 0
		// for data retrieved from cache or backend
		var dataLoaded = {}
		for (var userId in users) {
			user = users[userId]
			dataLoaded[userId] = {}
			// check if degree OK and we have not queried this data for this user before
			// check connected users only if user has enough cool sounds (more than his degree)
			if (!user.queried[dataType] && user.degree<=degree &&
				(dataType == 'sounds' || user.coolSounds.length>user.degree)) {
				//anything not found in cache goes here
				idsToQuery[userId] = []
				$.each(dataTypes[dataType], function(i, currDataType) {
					// check if data can be pulled from cache
					dataForUser = lscache.get(userId+currDataType)
					if (dataForUser) { // found in cache
						dataLoaded[userId][currDataType] = dataForUser
						counterCache +=1
					} else { // get from API
						idsToQuery[userId].push(currDataType)
						counterAPI +=1
					}
				})
				// idsToQuery[userId] = dataTypes[dataType]
				// counter +=1
			}
		}
		// skip API call if there is nothing to request
		if (counterAPI === 0) {
			console.log('skipping ' + dataType +
				' API calls, all ' + counterCache + ' were retrieved from cache.')
			processLoadedData(dataLoaded, dataType, degree)
			return
		}

		console.log('order '+ counterAPI + ' requests for ' + dataType)
		// call internal API to make SC calls
		var now = new Date()
		$.post(dataUrl, {
			'orders' : JSON.stringify(idsToQuery),
			'quicks': 'x' // parameter "quick": for local testing, backend only does few requests
		}).done(function(resp) {
			var newDate = new Date()
			console.log('took ' + (newDate - now)+ 'ms to get ' + counterAPI + ' ' + dataType +
				' data-sets, ' + counterCache + ' were retrieved from cache.')
				// ' + counter + ' users at degree ' + degree + '.')
			// combine received data with data from cache
			var recData = JSON.parse(resp)
			for (var userId in recData) {
				var userData = recData[userId]
				// iterate all lists (favorites, tracks)
				for (var dataKind in userData) {
					var dataSet = JSON.parse(userData[dataKind])
					dataLoaded[userId][dataKind] = dataSet
					// store in cache (JSON as received). 
					// 10min storing for root user, one day for first degree, .5 days for 2nd degree so they're evicted first!
					// no caching for high degrees - that might overwrite data from low degrees!
					if (degree<=2) {
						var cacheTime = (degree === 0) ? 10 : 60*24*degree
						lscache.set(userId+dataKind, dataSet, cacheTime)
						console.log('set')
					}
				}
			}
			processLoadedData(dataLoaded, dataType, degree)
		})

	}

	function processLoadedData(dataLoaded, dataType, degree) {
		// process assembled data
		if (dataType == 'sounds') {storeSounds(dataLoaded, degree)}
		else if (dataType == 'connectedUsers') {storeConnections(dataLoaded, degree)}
	}








	// USER INTERACTIONS etc

	function startWithOAuthUser() {
		// retrive accessToken from LocalStorage
		var accessTokenSC = localStorage.accessTokenSC
		// when redirected form SC oauth dialog
		var oauthCode = getParameterByName('code')
		if (accessTokenSC) {
			// we are authorized
			startWithId('me', accessTokenSC)
		} else if (!accessTokenSC && oauthCode) {
			// get accessToken, then restart
			$.post('https://api.soundcloud.com/oauth2/token', {
				'client_id': SOUNDCLOUD_CLIENT_ID,
				'client_secret': SOUNDCLOUD_CLIENT_SECRET,
				'redirect_uri': SOUNDCLOUD_OAUTH_REDIRECT_URL,
				'grant_type': 'authorization_code',
				'code': oauthCode
			}).fail(function reqFail(data, status, jqXHR) {console.log(data)})
			.done(function reqDone(data, status, jqXHR) {
				// store token and start again
				if (typeof(data) == 'object' && 'access_token' in data) {
					localStorage.accessTokenSC = data['access_token']
					startWithOAuthUser()
				} else {console.log(data)}
			})
			// remove code from displayed url
			var url = location.protocol+'//'+location.hostname+
				(location.port ? ':'+location.port: '')+'/'
			history.pushState({id: 'oauth_code'}, '', url);
		} else {
			// splashpage prompt user to authorize on SC
			location.href = '/splashpage'
		}
	}

	function logVisit(userJSON) {
		$.post('/log',userJSON)
	}

	// get a URL query paramter. used to extract oauth code
	function getParameterByName(name) {
		// name = name.replace(/[\[]/, "\\\[").replace(/[\]]/, "\\\]");
		var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
			results = regex.exec(location.search);
		return results === null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
	}

	function startWithId(id, accessTokenSC) {
		var url = 'https://api.soundcloud.com/users/'+id+
		'.json?client_id='+SOUNDCLOUD_CLIENT_ID
		if (id == 'me' && accessTokenSC) {
			url = "https://api.soundcloud.com/me.json?oauth_token=" + accessTokenSC
		}
		$.getJSON(url).done(function(user) {
			console.log("Start graph search for user " + user.username)
			rootID = user.id
			users[rootID] = new User(rootID, 0, user)
			// start traveling down the tree
			loadDataAtMaxDegree('sounds', 0)
			// log this visit on backend
			logVisit(user)
			// URL for sharing
			var newurl = location.protocol+'//'+location.hostname+
				(location.port ? ':'+location.port: '')+'/'+user.permalink
			history.pushState({id: 'user.permalink'}, '', newurl);

		})
		// show button for Connect to Soundcloud if not connected
		if (!localStorage.accessTokenSC) {
			console.log(localStorage.accessTokenSC)
			$('#oauth_button').show()
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

	// engineering
	try {
		if (window.chrome.loadTimes().wasFetchedViaSpdy) {
			console.log('loaded via SPDY')
		} else {
			console.log('no SPDY')
		}
	} catch(e) {
		console.log(e)
	}



	// startWithId('emeli-st-rmer')
	// emeli-st-rmer
	// eleonore-van-roosendaal

})