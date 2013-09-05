/* undo-plugin.js is part of Aloha Editor project http://aloha-editor.org
 *
 * Aloha Editor is a WYSIWYG HTML5 inline editing library and editor.
 * Copyright (c) 2010-2012 Gentics Software GmbH, Vienna, Austria.
 * Contributors http://aloha-editor.org/contribution.php
 *
 * Aloha Editor is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * as published by the Free Software Foundation; either version 2
 * of the License, or any later version.
 *
 * Aloha Editor is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301, USA.
 *
 * As an additional permission to the GNU GPL version 2, you may distribute
 * non-source (e.g., minimized or compacted) forms of the Aloha-Editor
 * source code without the copy of the GNU GPL normally required,
 * provided you include this license notice and a URL through which
 * recipients can access the Corresponding Source.
 */
/* globals Undo */
define(function (require) {
	'use strict';

	/**
	 * Module dependencies.
	 */
	var Aloha = require('aloha'),
		Plugin = require('aloha/plugin'),
		Ui = require('ui/ui'),
		Button = require('ui/button'),
		rangy = require('aloha/rangy-core'),
		$ = require('jquery');

	require('undo/vendor/undo');

	/**
	 * Restore blocks in the active editor.
	 */
	function enableBlocks() {
		if (!Aloha.settings.plugins.block.defaults) {
			Aloha.settings.plugins.block.defaults = {};
		}

		var editable = Aloha.getActiveEditable();

		if (editable !== null) {
			var $editor = $(editable.obj);

			$.each(Aloha.settings.plugins.block.defaults, function (selector, instanceDefaults) {
				$editor.find(selector).alohaBlock(instanceDefaults);
			});
		}
	}

	/**
	 * Undo/redo command.
	 * @type Object
	 */
	var EditCommand = Undo.Command.extend({
		constructor: function (editable, content, bookmark) {
			this.editable = editable;
			this.content = content;
			this.bookmark = bookmark;
		},

		execute: function () {},

		undo: function () {
			plugin.setContent(this.editable, this.content, this.bookmark);
		},

		redo: function () {
			plugin.setContent(this.editable, this.content, this.bookmark);
		},
	});

	/**
	 * Register the plugin with unique name.
	 */
	var plugin = Plugin.create('undo', {

		undoInProgress: false,
		snaphotInProgress: false,

		/**
		 * Initialize the plugin and set initialize flag on true.
		 */
		init: function () {
			plugin.stack = new Undo.Stack();

			plugin.stack.changed = function () {
				plugin.updateButtons();
			};

			plugin.createButtons();

			Aloha.bind('aloha-editable-created', function (e, editable) {
				editable.obj.bind('keydown', 'ctrl+z meta+z ctrl+shift+z meta+shift+z', function (event) {
					event.preventDefault();
					if (event.shiftKey) {
						plugin.redo();
					} else {
						plugin.undo();
					}
				});
			});

			Aloha.bind('aloha-smart-content-changed', function (event, obj) {
				plugin.stack.execute(new EditCommand(
					obj.editable,
					obj.editable.undoSnapshotContent,
					obj.editable.undoSnapshotBookmark
				));
				plugin.snaphotInProgress = false;
			});

			Aloha.bind('aloha-command-will-execute', function (event, obj) {
				if (!plugin.snaphotInProgress) {
					plugin.takeSnapshot(obj.editable);
				}
				plugin.snaphotInProgress = true;
			});

			Aloha.bind('aloha-editable-activated', function () {
				plugin.undoInProgress = false;
				plugin.snapshotInProgress = false;
				plugin.updateButtons();

				// reset undo stack so history is restricted to one editable (and prevent it to grow forever)
				plugin.stack.commands = [];
				plugin.stack.stackPosition = plugin.stack.savePosition = -1;
			});
		},

		/**
		 * Take a snapshot of the current editable content.
		 * @param {Aloha.Editable} editable
		 */
		takeSnapshot: function (editable) {
			if (plugin.undoInProgress) {
				return;
			}

			if (typeof editable !== 'object') {
				editable = Aloha.getActiveEditable();
			}

			// Store content and bookmark which will be used on the next snapshot.
			editable.undoSnapshotContent = editable.obj.html();
			editable.undoSnapshotBookmark = rangy.getSelection().getBookmark(editable.obj[0]);
		},

		/**
		 * Update the content on the editable with the given content and restore the selection.
		 * @param  {Aloha.Editable} editable
		 * @param  {String} content
		 * @param  {Object} bookmark
		 */
		setContent: function (editable, content, bookmark) {
			var data = {
				editable: editable,
				content: content
			};

			plugin.undoInProgress = true;
			Aloha.trigger('aloha-undo-content-will-change', data);

			editable.obj.html(content);
			enableBlocks();

			// Restore selection and cursor
			rangy.getSelection().moveToBookmark(bookmark);

			Aloha.trigger('aloha-undo-content-changed', data);
			plugin.undoInProgress = false;
		},

		/**
		 * Undo the last action if possible.
		 */
		undo: function () {
			if (plugin.stack.canUndo()) {
				plugin.stack.undo();
			}
		},

		/**
		 * Redo the last action if possible.
		 */
		redo: function () {
			if (plugin.stack.canRedo()) {
				plugin.stack.redo();
			}
		},

		/**
		 * Create the undo/redo buttons.
		 */
		createButtons: function () {
			plugin.undoButton = Ui.adopt('undo', Button, {
				tooltip: 'Undo',
				icon: 'aloha-button-undo',
				scope: 'Aloha.continuoustext',
				click: function () {
					plugin.undo();
				}
			});

			plugin.redoButton = Ui.adopt('redo', Button, {
				tooltip: 'Redo',
				icon: 'aloha-button-redo',
				scope: 'Aloha.continuoustext',
				click: function () {
					plugin.redo();
				}
			});

			plugin.updateButtons();
		},

		/**
		 * Update the undo/redo buttons with the proper state.
		 */
		updateButtons: function () {
			plugin.undoButton.element.button('option', 'disabled', !plugin.stack.canUndo());
			plugin.redoButton.element.button('option', 'disabled', !plugin.stack.canRedo());
		},

		/**
		 * toString method.
		 * @return String
		 */
		toString: function () {
			return 'undo';
		}
	});

	return plugin;
});