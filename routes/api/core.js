/**
 * @file /routes/api/core
 * @desc
 *
 * @notes
 *
 */

// required modules
var express = require('express');
var router = express.Router();
var modelLib = require('../../libs/model');


/**
 * @route /api/:model/paginate
 * @method GET
 * @desc Fetch a paginated collection of models
 *
 * @param model {String}
 *
 * @query where {Object}
 * @query orWhere {Object}
 * @query order {String} and orderBy {String}
 * @query searchKeys {Comma Separated String} and searchTerm {String}
 * @query page {Integer}
 * @query pageSize {Integer}
 * @query withRelated {Comma Separated String}
 *
 * @return collection {Object}
 *
 */
router.get('/:model/paginate', function(req, res) {

	'use strict';

	var Model = modelLib.getModel(req.params.model);

	if(!Model){
		res.status(400);
		return res.jsend.fail({message: 'Invalid model parameter.'});
	}

	modelLib.fetchCollection(req.params.model, {
		where: req.query.where,
		orWhere: req.query.orWhere,
		orderBy : req.query.orderBy,
		order: req.query.order,
		searchKeys: req.query.searchKeys,
		searchTerm: req.query.searchTerm,
		page: req.query.page,
		pageSize: req.query.pageSize,
		withRelated: req.query.withRelated
	}).then(function( collection ) {
		
		res.send({
			"status" : "success",
			"pagination": collection.pagination,
			"data" : collection.toJSON()
		});
		
	}).catch(function(error){
		
		console.error(error);
		res.status(error.status ? error.status : 400);
		res.jsend.error(error);
		
	});
});

/**
 * @route /api/:model/:id
 * @method GET
 * @desc Fetch a model by ID
 *
 * @param model {String}
 * @param id {String}
 *
 * @return model {Object}
 *
 */
router.get('/:model/:id', function(req, res) {

	'use strict';

	var Model = modelLib.getModel(req.params.model);

	if(!Model){
		res.status(400);
		return res.jsend.fail({message: 'Invalid model parameter.'});
	}

	if(!req.params.id) {
		res.status(400);
		return res.jsend.fail({message: 'Invalid id parameter.'});
	}

	modelLib.fetchModel(req.params.model, {
		where: { id : req.params.id }
	}).then(function( model ) {

		if( !model ) {
			throw { status: 404, id: 'invalid', message:  'No data found for ' + req.params.model + ' ' + req.params.id };
		}

		res.jsend.success( model.toJSON() );

	}).catch(function(error){

		console.error(error);
		res.status(error.status ? error.status : 400);
		res.jsend.error(error);

	});

});

/**
 * @route /api/:model/:id
 * @method POST
 * @desc Create a model
 *
 * @param model {String}
 *
 * @return model {Object}
 *
 */
router.post('/:model', function(req, res) {

	'use strict';

	var Model = modelLib.getModel(req.params.model);

	if(!Model){
		res.status(400);
		return res.jsend.fail({message: 'Invalid model parameter.'});
	}

	if(!req.body) {
		res.status(400);
		return res.jsend.fail({message: 'Invalid request body.'});
	}

	new Model( req.body ).save().then(function( model ) {

		res.jsend.success( model.toJSON() );

	}).catch(function(error){

		console.error(error);
		res.status(error.status ? error.status : 400);
		res.jsend.error(error);

	});

});

/**
 * @route /api/:model/:id
 * @method PUT
 * @desc Update a Model by ID. Fetch the model first to ensure we have an existing model.
 *
 * @param model {String}
 * @param id {String}
 *
 * @return model {Object}
 *
 */
router.put('/:model/:id', function(req, res) {

	'use strict';

	var Model = modelLib.getModel(req.params.model);

	if(!Model){
		res.status(400);
		return res.jsend.fail({message: 'Invalid model parameter.'});
	}

	if(!req.params.id) {
		res.status(400);
		return res.jsend.fail({message: 'Invalid id parameter.'});
	}

	if(!req.body) {
		res.status(400);
		return res.jsend.fail({message: 'Invalid request body.'});
	}

	new Model( { id : req.params.id } ).fetch().then(function( model ) {

		if( !model ) {
			throw { status: 404, id: 'invalid', message:  'No data found for ' + req.params.model + ' ' + req.params.id };
		}

		return model.save(req.body);

	}).then(function(model){

		res.jsend.success( model.toJSON() );

	}).catch(function(error){

		console.error(error);
		res.status(error.status ? error.status : 400);
		res.jsend.error(error);

	});

});

/**
 * @route /api/:model/:id
 * @method DELETE
 * @desc Delete an existing model
 *
 * @param model {String}
 * @param id {String}
 *
 * @return model {Object}
 *
 */
router.delete('/:model/:id', function(req, res) {

	'use strict';
	
	var Model = modelLib.getModel(req.params.model);

	if(!Model){
		res.status(400);
		return res.jsend.fail({message: 'Invalid model parameter.'});
	}

	if(!req.params.id) {
		res.status(400);
		return res.jsend.fail({message: 'Invalid id parameter.'});
	}

	new Model( { id : req.params.id } ).fetch().then(function( model ) {

		if( !model ) {
			throw { status: 404, id: 'invalid', message:  'No data found for ' + req.params.model + ' ' + req.params.id };
		}
		
		return model.destroy();

	}).then(function(model){
		
		res.jsend.success( model.toJSON() );
		
	}).catch(function(error){

		console.error(error);
		res.status(error.status || 400);
		res.jsend.error(error);

	});

});

module.exports = router;
