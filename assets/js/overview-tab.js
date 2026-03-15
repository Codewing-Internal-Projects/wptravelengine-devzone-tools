/**
 * WPTE Dev Zone — OverviewTab
 * Settings tree: search, pagination, lazy-load, edit, delete.
 */
/* global wpteDbg */

import { DomHelper }    from './dom-helper.js';
import { InlineEditor } from './inline-editor.js';

const { ajaxurl, nonce } = wpteDbg;
const OPTS_PER_PAGE = 20;

export class OverviewTab {
	constructor( contentEl ) {
		this.contentEl   = contentEl;
		this.optionsPage = 1;
		this.editor      = new InlineEditor( () => null, () => null );
	}

	init() {
		// Section collapse toggles
		this.contentEl.querySelectorAll( '.wte-dbg-section-header' ).forEach( ( hdr ) => {
			hdr.addEventListener( 'click', () => {
				hdr.closest( '.wte-dbg-section' ).classList.toggle( 'is-collapsed' );
			} );
		} );

		const tree = this.contentEl.querySelector( '.wte-dbg-options-tree' );
		if ( ! tree ) return;

		// Search input
		const searchInput = document.createElement( 'input' );
		searchInput.type        = 'text';
		searchInput.className   = 'wte-dbg-option-search';
		searchInput.placeholder = 'Search options\u2026';
		tree.insertAdjacentElement( 'beforebegin', searchInput );

		const paginEl = this.contentEl.querySelector( '.wte-dbg-options-pagination' );

		const renderPage = () => this._renderOptionsPage( tree, searchInput, paginEl );

		searchInput.addEventListener( 'input', () => {
			this.optionsPage = 1;
			renderPage();
		} );

		renderPage();

		// Lazy-load on first expand
		tree.querySelectorAll( '.wte-dbg-option-root' ).forEach( ( details ) => {
			details.addEventListener( 'toggle', () => this._onOptionToggle( details ) );
		} );

		// Edit button delegation
		tree.addEventListener( 'click', ( e ) => {
			const btn = e.target.closest( '.wte-dbg-edit-btn' );
			if ( btn ) {
				const row = btn.closest( '.wte-dbg-row' );
				if ( row ) this.editor.activateEdit( row );
			}
		} );

		// Delete option button delegation
		const settingsTab = tree.closest( '.wte-dbg-settings-tab' );
		if ( settingsTab ) {
			settingsTab.addEventListener( 'click', ( e ) => {
				const btn = e.target.closest( '.wte-dbg-delete-option-btn' );
				if ( ! btn ) return;

				e.stopPropagation();
				e.preventDefault();

				const optionName = btn.dataset.optionName;
				// eslint-disable-next-line no-alert
				if ( ! window.confirm( 'Delete option "' + optionName + '"?\n\nThis removes it from the database and cannot be undone.' ) ) return;

				this.editor.doDeleteOption( btn, optionName );
			} );
		}
	}

	_renderOptionsPage( tree, searchInput, paginEl ) {
		const q      = searchInput.value.toLowerCase().trim();
		const blocks = [ ...tree.querySelectorAll( '.wte-dbg-option-block' ) ];

		blocks.forEach( ( b ) => {
			const name = ( b.querySelector( '.wte-dbg-option-root' )?.dataset.optionName || '' ).toLowerCase();
			b.dataset.searchVisible = ( ! q || name.includes( q ) ) ? '1' : '0';
		} );

		const visible    = blocks.filter( ( b ) => b.dataset.searchVisible === '1' );
		const totalPages = Math.max( 1, Math.ceil( visible.length / OPTS_PER_PAGE ) );

		if ( this.optionsPage > totalPages ) this.optionsPage = 1;

		blocks.forEach( ( b ) => ( b.style.display = 'none' ) );
		const start = ( this.optionsPage - 1 ) * OPTS_PER_PAGE;
		visible.slice( start, start + OPTS_PER_PAGE ).forEach( ( b ) => ( b.style.display = '' ) );

		DomHelper.buildPagination( paginEl, this.optionsPage, totalPages, ( p ) => {
			this.optionsPage = p;
			this._renderOptionsPage( tree, searchInput, paginEl );
		} );
	}

	_onOptionToggle( details ) {
		if ( ! details.open ) return;

		const body = details.querySelector( '.wte-dbg-option-body' );
		if ( ! body || ! body.classList.contains( 'wte-dbg-lazy' ) ) return;

		body.classList.remove( 'wte-dbg-lazy' );
		body.classList.add( 'wte-dbg-skeleton' );

		const params = new URLSearchParams( {
			action:      'wpte_devzone_get_option',
			option_name: details.dataset.optionName,
			_ajax_nonce: nonce,
		} );

		DomHelper.setStatus( 'Loading\u2026', 'info' );

		fetch( ajaxurl + '?' + params )
			.then( ( r ) => r.json() )
			.then( ( res ) => {
				body.classList.remove( 'wte-dbg-skeleton' );
				DomHelper.clearStatus();
				if ( res.success ) {
					DomHelper.setServerHtml( body, res.data.html );
					DomHelper.applyRowStripes( body );
					if ( res.data.count !== null && res.data.count !== undefined ) {
						let badge = details.querySelector( 'summary .wte-dbg-count' );
						if ( ! badge ) {
							badge = document.createElement( 'span' );
							badge.className = 'wte-dbg-count';
							details.querySelector( 'summary' ).appendChild( badge );
						}
						badge.textContent = '[' + res.data.count + ' item' + ( res.data.count !== 1 ? 's' : '' ) + ']';
					}
				} else {
					body.textContent = 'Error loading option.';
				}
			} )
			.catch( () => {
				body.classList.remove( 'wte-dbg-skeleton' );
				DomHelper.clearStatus();
				body.textContent = 'Request failed.';
			} );
	}
}
