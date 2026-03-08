/**
 * WPTE Dev Zone — Frontend JS
 * Handles: inline editing, AJAX save/load, list rendering, inspector panel.
 *
 * Security note: All server-supplied strings are HTML-escaped via esc() before
 * any innerHTML assignment. No raw user input is ever inserted unescaped.
 */
/* global wpteDbg */

( function () {
	'use strict';

	// Injected via wp_localize_script
	const { ajaxurl, nonce } = wpteDbg;

	// State
	let currentPostId   = null;
	let currentPostType = null;
	let searchTimeout   = null;

	// Options pagination
	const OPTS_PER_PAGE = 20;

	// -----------------------------------------------------------------------
	// Bootstrap
	// -----------------------------------------------------------------------

	document.addEventListener( 'DOMContentLoaded', () => {
		initTabSwitching();
		initThemeToggle();

		// Restore last active tab across reloads.
		// PHP renders 'settings' by default (no ?tab= in URL); if the user was
		// on a different tab, load it via AJAX (which calls initMasterDetailPanels
		// + initSettingsTree internally after the content is replaced).
		const TAB_KEY  = 'wte_dbg_tab';
		let savedTab   = null;
		try { savedTab = localStorage.getItem( TAB_KEY ); } catch ( e ) {}

		const content     = document.querySelector( '.wte-dbg-content' );
		const renderedTab = ( content && content.dataset.renderedTab ) || 'settings';

		if ( savedTab && savedTab !== renderedTab ) {
			loadTabContent( savedTab ); // also calls initMasterDetailPanels + initSettingsTree
		} else {
			initMasterDetailPanels();
			initSettingsTree();
		}
	} );

	// -----------------------------------------------------------------------
	// Tab switching (AJAX, no page reload)
	// -----------------------------------------------------------------------

	function initTabSwitching() {
		const TAB_KEY = 'wte_dbg_tab';
		document.querySelectorAll( '.wte-dbg-tab' ).forEach( ( tabLink ) => {
			tabLink.addEventListener( 'click', ( e ) => {
				e.preventDefault();
				const slug = new URL( tabLink.href ).searchParams.get( 'tab' ) || 'settings';
				try { localStorage.setItem( TAB_KEY, slug ); } catch ( e ) {}
				loadTabContent( slug );
			} );
		} );
	}

	function loadTabContent( slug ) {
		document.querySelectorAll( '.wte-dbg-tab' ).forEach( ( t ) => {
			const tSlug = new URL( t.href ).searchParams.get( 'tab' ) || 'settings';
			t.classList.toggle( 'is-active', tSlug === slug );
		} );

		currentPostId   = null;
		currentPostType = null;
		clearTimeout( searchTimeout );

		const content = document.querySelector( '.wte-dbg-content' );
		setTextContent( content, '' );
		content.appendChild( makePara( 'wte-dbg-loading', 'Loading\u2026' ) );

		fetch( ajaxurl, {
			method: 'POST',
			body:   new URLSearchParams( {
				action:      'wpte_devzone_load_tab',
				tab:         slug,
				_ajax_nonce: nonce,
			} ),
		} )
			.then( ( r ) => r.json() )
			.then( ( res ) => {
				setTextContent( content, '' );
				content.style.visibility = '';
				if ( ! res.success ) {
					content.appendChild( makePara( 'wte-dbg-empty', 'Failed to load tab.' ) );
					return;
				}
				setServerHtml( content, res.data.html );
				initMasterDetailPanels();
				initSettingsTree();
				if ( typeof window.wpteDbgInitSearch === 'function' ) {
					window.wpteDbgInitSearch();
				}
			} )
			.catch( () => {
				setTextContent( content, '' );
				content.style.visibility = '';
				content.appendChild( makePara( 'wte-dbg-empty', 'Request failed.' ) );
			} );
	}

	// -----------------------------------------------------------------------
	// Settings tab — lazy-load values + client-side search
	// -----------------------------------------------------------------------

	/**
	 * Safely insert server-rendered HTML into an element.
	 * The server escapes all values with esc_html/esc_attr (Renderer.php).
	 * This helper exists to document that the assignment is intentional.
	 */
	function setServerHtml( el, html ) {
		setTextContent( el, '' );
		el.insertAdjacentHTML( 'beforeend', html );
	}

	function initSettingsTree() {
		// Collapse toggles for overview named sections
		document.querySelectorAll( '.wte-dbg-settings-tab .wte-dbg-section-header' ).forEach( ( hdr ) => {
			hdr.addEventListener( 'click', () => {
				hdr.closest( '.wte-dbg-section' ).classList.toggle( 'is-collapsed' );
			} );
		} );

		const tree = document.querySelector( '.wte-dbg-options-tree' );
		if ( ! tree ) return;

		// Page state — reset on every tab load
		let optionsPage = 1;

		// A. Search input
		const searchInput = document.createElement( 'input' );
		searchInput.type        = 'text';
		searchInput.className   = 'wte-dbg-option-search';
		searchInput.placeholder = 'Search options\u2026';
		tree.insertAdjacentElement( 'beforebegin', searchInput );

		const paginEl = document.querySelector( '.wte-dbg-options-pagination' );

		function renderOptionsPage() {
			const q      = searchInput.value.toLowerCase().trim();
			const blocks = [ ...tree.querySelectorAll( '.wte-dbg-option-block' ) ];

			// Apply search visibility
			blocks.forEach( ( b ) => {
				const name = ( b.querySelector( '.wte-dbg-option-root' )?.dataset.optionName || '' ).toLowerCase();
				b.dataset.searchVisible = ( ! q || name.includes( q ) ) ? '1' : '0';
			} );

			const visible    = blocks.filter( ( b ) => b.dataset.searchVisible === '1' );
			const totalPages = Math.max( 1, Math.ceil( visible.length / OPTS_PER_PAGE ) );

			if ( optionsPage > totalPages ) optionsPage = 1;

			// Show only current page among visible blocks
			blocks.forEach( ( b ) => ( b.style.display = 'none' ) );
			const start = ( optionsPage - 1 ) * OPTS_PER_PAGE;
			visible.slice( start, start + OPTS_PER_PAGE ).forEach( ( b ) => ( b.style.display = '' ) );

			buildPagination( paginEl, optionsPage, totalPages, ( p ) => {
				optionsPage = p;
				renderOptionsPage();
			} );
		}

		searchInput.addEventListener( 'input', () => {
			optionsPage = 1;
			renderOptionsPage();
		} );

		renderOptionsPage(); // Initial render

		// B. Lazy-load on first expand
		tree.querySelectorAll( '.wte-dbg-option-root' ).forEach( ( details ) => {
			details.addEventListener( 'toggle', () => {
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

				fetch( ajaxurl + '?' + params )
					.then( ( r ) => r.json() )
					.then( ( res ) => {
						body.classList.remove( 'wte-dbg-skeleton' );
						if ( res.success ) {
							// Server HTML is escaped via esc_html/esc_attr in Renderer.php
							setServerHtml( body, res.data.html );
							applyRowStripes( body );
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
						body.textContent = 'Request failed.';
					} );
			} );
		} );

		// Wire up edit button clicks (delegation covers dynamically inserted rows)
		tree.addEventListener( 'click', ( e ) => {
			const btn = e.target.closest( '.wte-dbg-edit-btn' );
			if ( btn ) {
				const row = btn.closest( '.wte-dbg-row' );
				if ( row ) activateEdit( row );
			}
		} );

		// Wire up delete option buttons (delegate on the settings-tab wrapper so
		// clicks on buttons outside <details> are also captured)
		tree.closest( '.wte-dbg-settings-tab' ).addEventListener( 'click', ( e ) => {
			const btn = e.target.closest( '.wte-dbg-delete-option-btn' );
			if ( ! btn ) return;

			// Prevent the <details> toggle from firing
			e.stopPropagation();
			e.preventDefault();

			const optionName = btn.dataset.optionName;
			// eslint-disable-next-line no-alert
			if ( ! window.confirm( 'Delete option "' + optionName + '"?\n\nThis removes it from the database and cannot be undone.' ) ) return;

			doDeleteOption( btn, optionName );
		} );
	}

	// -----------------------------------------------------------------------
	// Master-detail panels (Trips / Bookings / Customers)
	// -----------------------------------------------------------------------

	function initMasterDetailPanels() {
		document.querySelectorAll( '.wte-dbg-master-detail' ).forEach( ( panel ) => {
			const postType  = panel.dataset.postType;
			const searchEl  = panel.querySelector( '.wte-dbg-search' );
			const listEl    = panel.querySelector( '.wte-dbg-list-items' );
			const paginEl   = panel.querySelector( '.wte-dbg-pagination' );
			const inspector = panel.querySelector( '.wte-dbg-inspector-panel' );

			loadList( postType, '', 1, listEl, paginEl, panel, inspector );

			if ( searchEl ) {
				searchEl.addEventListener( 'input', () => {
					clearTimeout( searchTimeout );
					searchTimeout = setTimeout( () => {
						loadList( postType, searchEl.value, 1, listEl, paginEl, panel, inspector );
					}, 400 );
				} );
			}
		} );
	}

	function loadList( postType, search, page, listEl, paginEl, panel, inspector ) {
		setTextContent( listEl, '' );
		listEl.appendChild( makePara( 'wte-dbg-loading', 'Loading…' ) );

		const params = new URLSearchParams( {
			action:      'wpte_devzone_list_posts',
			post_type:   postType,
			search:      search || '',
			paged:       page,
			_ajax_nonce: nonce,
		} );

		fetch( ajaxurl + '?' + params )
			.then( ( r ) => r.json() )
			.then( ( res ) => {
				setTextContent( listEl, '' );

				if ( ! res.success ) {
					listEl.appendChild( makePara( 'wte-dbg-empty', 'Error: ' + ( res.data && res.data.message ? res.data.message : 'Unknown' ) ) );
					return;
				}

				const posts      = res.data.posts;
				const total      = res.data.total;
				const totalPages = res.data.total_pages;

				const countEl = panel.querySelector( '.wte-dbg-list-count' );
				if ( countEl ) countEl.textContent = '(' + total + ')';

				if ( ! posts.length ) {
					listEl.appendChild( makePara( 'wte-dbg-empty', 'No records found.' ) );
				} else {
					posts.forEach( ( p ) => {
						const item = buildListItem( p );
						item.addEventListener( 'click', () => {
							listEl.querySelectorAll( '.wte-dbg-list-item' ).forEach( ( i ) => i.classList.remove( 'is-active' ) );
							item.classList.add( 'is-active' );
							loadInspector( parseInt( item.dataset.postId, 10 ), postType, inspector );
						} );
						listEl.appendChild( item );
					} );
					listEl.querySelector( '.wte-dbg-list-item' )?.click();
				}

				buildPagination( paginEl, page, totalPages, ( newPage ) => {
					loadList( postType, search, newPage, listEl, paginEl, panel, inspector );
				} );
			} )
			.catch( () => {
				setTextContent( listEl, '' );
				listEl.appendChild( makePara( 'wte-dbg-empty', 'Request failed.' ) );
			} );
	}

	function buildListItem( post ) {
		const item = document.createElement( 'div' );
		item.className = 'wte-dbg-list-item';
		item.dataset.postId = post.id;

		const title = document.createElement( 'span' );
		title.className = 'wte-dbg-list-item-title';
		title.textContent = post.title;

		const meta = document.createElement( 'span' );
		meta.className = 'wte-dbg-list-item-meta';

		const badge = document.createElement( 'span' );
		badge.className = 'wte-dbg-status wte-dbg-status-' + post.status;
		badge.textContent = post.status;

		const date = post.date ? post.date.split( ' ' )[ 0 ] : '';
		const idSpan = document.createTextNode( '\u00a0 ID:' + post.id + '\u00a0\u00a0' + date );

		meta.appendChild( badge );
		meta.appendChild( idSpan );
		item.appendChild( title );
		item.appendChild( meta );

		return item;
	}

	function buildPagination( paginEl, page, totalPages, onPage ) {
		setTextContent( paginEl, '' );
		if ( totalPages <= 1 ) return;

		const prev = document.createElement( 'button' );
		prev.className = 'wte-dbg-page-btn';
		prev.textContent = '\u00ab Prev';
		prev.dataset.page = page - 1;
		if ( page <= 1 ) prev.disabled = true;

		const info = document.createElement( 'span' );
		info.style.cssText = 'font-size:12px;padding:0 8px;';
		info.textContent = page + ' / ' + totalPages;

		const next = document.createElement( 'button' );
		next.className = 'wte-dbg-page-btn';
		next.textContent = 'Next \u00bb';
		next.dataset.page = page + 1;
		if ( page >= totalPages ) next.disabled = true;

		[ prev, next ].forEach( ( btn ) => {
			if ( ! btn.disabled ) {
				btn.addEventListener( 'click', () => onPage( parseInt( btn.dataset.page, 10 ) ) );
			}
		} );

		paginEl.appendChild( prev );
		paginEl.appendChild( info );
		paginEl.appendChild( next );
	}

	// -----------------------------------------------------------------------
	// Inspector panel
	// -----------------------------------------------------------------------

	function loadInspector( postId, postType, inspector ) {
		currentPostId   = postId;
		currentPostType = postType;

		setTextContent( inspector, '' );
		inspector.appendChild( makePara( 'wte-dbg-loading', 'Loading inspector…' ) );

		const params = new URLSearchParams( {
			action:      'wpte_devzone_get_post',
			post_id:     postId,
			_ajax_nonce: nonce,
		} );

		fetch( ajaxurl + '?' + params )
			.then( ( r ) => r.json() )
			.then( ( res ) => {
				setTextContent( inspector, '' );
				if ( ! res.success ) {
					const err = document.createElement( 'div' );
					err.className = 'wte-dbg-error-notice';
					err.textContent = 'Error: ' + ( res.data && res.data.message ? res.data.message : 'Unknown' );
					inspector.appendChild( err );
					return;
				}
				renderInspector( res.data, inspector, postType );
			} )
			.catch( () => {
				setTextContent( inspector, '' );
				const err = document.createElement( 'div' );
				err.className = 'wte-dbg-error-notice';
				err.textContent = 'Request failed.';
				inspector.appendChild( err );
			} );
	}

	function renderInspector( data, inspector, postType ) {
		const post       = data.post;
		const meta       = data.meta;
		const taxonomies = data.taxonomies;

		// Header
		const header = document.createElement( 'div' );
		header.className = 'wte-dbg-inspector-header';

		const titleEl = document.createElement( 'div' );
		titleEl.className = 'wte-dbg-inspector-title';
		titleEl.textContent = post.post_title || '#' + post.ID;

		const subEl = document.createElement( 'div' );
		subEl.className = 'wte-dbg-inspector-subtitle';
		subEl.textContent = 'ID: ' + post.ID + ' \u2022 Type: ' + post.post_type;

		header.appendChild( titleEl );
		header.appendChild( subEl );
		inspector.appendChild( header );

		// Body
		const body = document.createElement( 'div' );
		body.className = 'wte-dbg-inspector-body';

		body.appendChild( buildInspectorSection( 'Post Fields', buildPostFieldsDOM( post ) ) );
		body.appendChild( buildInspectorSection( 'Meta', buildMetaTreeDOM( meta ) ) );
		body.appendChild( buildInspectorSection( 'Taxonomies', buildTaxonomiesDOM( taxonomies ) ) );

		inspector.appendChild( body );

		// Wire section collapse toggles
		inspector.querySelectorAll( '.wte-dbg-section-header' ).forEach( ( hdr ) => {
			hdr.addEventListener( 'click', () => {
				hdr.closest( '.wte-dbg-section' ).classList.toggle( 'is-collapsed' );
			} );
		} );

		// Inline edit clicks
		inspector.addEventListener( 'click', ( e ) => {
			const btn = e.target.closest( '.wte-dbg-edit-btn' );
			if ( btn ) {
				const row = btn.closest( '.wte-dbg-row' );
				if ( row ) activateEdit( row );
			}

			const link = e.target.closest( '.wte-dbg-link[data-post-id]' );
			if ( link ) {
				const linkedId   = parseInt( link.dataset.postId, 10 );
				const linkedType = link.dataset.postType || postType;
				loadInspector( linkedId, linkedType, inspector );
			}
		} );

		// Status select: save on change
		const statusSel = inspector.querySelector( '.wte-dbg-status-select' );
		if ( statusSel ) {
			statusSel.addEventListener( 'change', () => {
				savePostField( post.ID, 'post_status', statusSel.value, statusSel );
			} );
		}
	}

	function buildInspectorSection( title, contentNode ) {
		const section = document.createElement( 'div' );
		section.className = 'wte-dbg-section';

		const hdr = document.createElement( 'div' );
		hdr.className = 'wte-dbg-section-header';
		hdr.textContent = title;

		const bodyDiv = document.createElement( 'div' );
		bodyDiv.className = 'wte-dbg-section-body';
		bodyDiv.appendChild( contentNode );

		section.appendChild( hdr );
		section.appendChild( bodyDiv );
		return section;
	}

	// Post fields DOM
	function buildPostFieldsDOM( post ) {
		const wrap = document.createElement( 'div' );

		// Status dropdown
		const statuses = [ 'publish', 'pending', 'draft', 'private', 'trash', 'booked', 'completed', 'cancelled' ];
		const statusRow = buildRow();
		statusRow.classList.add( 'wte-dbg-post-field' );
		statusRow.dataset.postId = post.ID;
		statusRow.dataset.field  = 'post_status';

		const statusKey = makeKeySpan( 'post_status' );
		const sel = document.createElement( 'select' );
		sel.className = 'wte-dbg-status-select wte-dbg-input';
		sel.style.cssText = 'font-size:12px;padding:2px 4px;';
		statuses.forEach( ( s ) => {
			const opt = document.createElement( 'option' );
			opt.value = s;
			opt.textContent = s;
			if ( post.post_status === s ) opt.selected = true;
			sel.appendChild( opt );
		} );
		statusRow.appendChild( statusKey );
		statusRow.appendChild( sel );
		wrap.appendChild( statusRow );

		// Title (editable)
		const titleRow = buildRow();
		titleRow.dataset.postId = post.ID;
		titleRow.dataset.field  = 'post_title';
		titleRow.appendChild( makeKeySpan( 'post_title' ) );
		titleRow.appendChild( makeValueSpan( post.post_title || '' ) );
		titleRow.appendChild( makeEditBtn() );
		wrap.appendChild( titleRow );

		// Date (read-only)
		const dateRow = buildRow();
		dateRow.appendChild( makeKeySpan( 'post_date' ) );
		dateRow.appendChild( makeValueSpan( post.post_date || '' ) );
		wrap.appendChild( dateRow );

		return wrap;
	}

	// Taxonomies DOM
	function buildTaxonomiesDOM( taxonomies ) {
		const wrap = document.createElement( 'div' );
		let hasAny = false;

		for ( const [ tax, terms ] of Object.entries( taxonomies ) ) {
			if ( ! terms.length ) continue;
			hasAny = true;

			const rowDiv = document.createElement( 'div' );
			rowDiv.style.cssText = 'padding:4px 20px;display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;';

			const keySpan = makeKeySpan( tax );
			keySpan.style.minWidth = '120px';
			rowDiv.appendChild( keySpan );

			const termsWrap = document.createElement( 'span' );
			termsWrap.style.cssText = 'display:inline-flex;flex-wrap:wrap;gap:4px;';
			terms.forEach( ( t ) => {
				const badge = document.createElement( 'span' );
				badge.className = 'wte-dbg-tax-term';
				badge.textContent = t;
				termsWrap.appendChild( badge );
			} );

			rowDiv.appendChild( termsWrap );
			wrap.appendChild( rowDiv );
		}

		if ( ! hasAny ) {
			wrap.appendChild( makePara( 'wte-dbg-tax-empty', 'No taxonomy terms.' ) );
		}

		return wrap;
	}

	// Meta tree DOM (recursive)
	function buildMetaTreeDOM( meta ) {
		const wrap = document.createElement( 'div' );
		wrap.className = 'wte-dbg-meta-tree';

		if ( ! meta || ! Object.keys( meta ).length ) {
			wrap.appendChild( makePara( 'wte-dbg-empty', 'No meta found.' ) );
			return wrap;
		}

		const keys = Object.keys( meta ).sort( ( a, b ) => {
			if ( a === 'wp_travel_engine_setting' ) return -1;
			if ( b === 'wp_travel_engine_setting' ) return 1;
			return a.localeCompare( b );
		} );

		keys.forEach( ( key ) => {
			wrap.appendChild( buildMetaNodeDOM( key, meta[ key ], '' ) );
		} );

		applyRowStripes( wrap );
		return wrap;
	}

	function buildMetaNodeDOM( key, value, parentPath ) {
		const path = parentPath ? parentPath + '.' + key : key;

		if ( value !== null && typeof value === 'object' ) {
			const details = document.createElement( 'details' );
			details.className = 'wte-dbg-node';

			const summary = document.createElement( 'summary' );
			summary.className = 'wte-dbg-key';

			const keyText = document.createTextNode( key + '\u00a0' );
			const countSpan = document.createElement( 'span' );
			countSpan.className = 'wte-dbg-count';
			const entries = Object.entries( value );
			countSpan.textContent = '[' + entries.length + ' item' + ( entries.length !== 1 ? 's' : '' ) + ']';

			summary.appendChild( keyText );
			summary.appendChild( countSpan );
			details.appendChild( summary );

			const children = document.createElement( 'div' );
			children.className = 'wte-dbg-children';
			entries.forEach( ( [ k, v ] ) => {
				children.appendChild( buildMetaNodeDOM( k, v, path ) );
			} );
			details.appendChild( children );

			return details;
		}

		// Scalar leaf
		const raw   = ( value === null || value === undefined ) ? '' : String( value );
		const row   = buildRow();
		row.dataset.metaKey = key;
		row.dataset.path    = path;
		const valSpan = makeValueSpan( raw );
		valSpan.dataset.type = value === null             ? 'null'
		                     : typeof value === 'boolean' ? 'boolean'
		                     : typeof value === 'number'  ? 'number'
		                     : 'string';
		row.appendChild( makeKeySpan( key ) );
		row.appendChild( valSpan );
		row.appendChild( makeEditBtn() );

		return row;
	}

	// -----------------------------------------------------------------------
	// Inline editing
	// -----------------------------------------------------------------------

	function activateEdit( row ) {
		if ( row.querySelector( '.wte-dbg-input' ) ) return;

		const valueEl = row.querySelector( '.wte-dbg-value' );
		const editBtn = row.querySelector( '.wte-dbg-edit-btn' );
		if ( ! valueEl || ! editBtn ) return;

		const raw    = valueEl.dataset.raw || '';
		const isLong = raw.length > 80;

		const input = document.createElement( isLong ? 'textarea' : 'input' );
		input.value     = raw;
		input.className = 'wte-dbg-input';

		const saveBtn   = makeButton( '\u2713', 'wte-dbg-save' );
		const cancelBtn = makeButton( '\u2717', 'wte-dbg-cancel' );

		valueEl.replaceWith( input );
		editBtn.replaceWith( saveBtn, cancelBtn );

		input.focus();

		saveBtn.addEventListener( 'click', () => doSave( row, input.value ) );
		cancelBtn.addEventListener( 'click', () => restoreRow( row, raw ) );

		input.addEventListener( 'keydown', ( e ) => {
			if ( e.key === 'Enter' && ! isLong ) {
				e.preventDefault();
				doSave( row, input.value );
			}
			if ( e.key === 'Escape' ) {
				restoreRow( row, raw );
			}
		} );
	}

	function restoreRow( row, raw ) {
		const input     = row.querySelector( '.wte-dbg-input' );
		const saveBtn   = row.querySelector( '.wte-dbg-save' );
		const cancelBtn = row.querySelector( '.wte-dbg-cancel' );

		if ( input ) {
			input.replaceWith( makeValueSpan( raw ) );
		}
		if ( saveBtn )   saveBtn.remove();
		if ( cancelBtn ) cancelBtn.remove();

		row.appendChild( makeEditBtn() );
	}

	function doSave( row, value ) {
		const isOption  = row.dataset.optionName !== undefined && row.dataset.optionName !== '';
		const isPostFld = row.dataset.field !== undefined && row.dataset.field !== '';

		let body;

		if ( isOption ) {
			body = {
				action:      'wpte_devzone_save_option',
				option_name: row.dataset.optionName,
				key_path:    row.dataset.path || '',
				value,
			};
		} else if ( isPostFld ) {
			body = {
				action:  'wpte_devzone_save_post_field',
				post_id: row.dataset.postId || currentPostId,
				field:   row.dataset.field,
				value,
			};
		} else {
			const parts   = ( row.dataset.path || '' ).split( '.' );
			const metaKey = parts[ 0 ];
			const keyPath = parts.slice( 1 ).join( '.' );
			body = {
				action:   'wpte_devzone_save_meta',
				post_id:  currentPostId,
				meta_key: metaKey,
				key_path: keyPath,
				value,
			};
		}

		body._ajax_nonce = nonce;

		fetch( ajaxurl, {
			method: 'POST',
			body:   new URLSearchParams( body ),
		} )
			.then( ( r ) => r.json() )
			.then( ( res ) => {
				if ( res.success ) {
					flashSuccess( row, value );
				} else {
					flashError( row, ( res.data && res.data.message ) ? res.data.message : 'Save failed' );
				}
			} )
			.catch( () => {
				flashError( row, 'Network error' );
			} );
	}

	function doDeleteOption( btn, optionName ) {
		btn.disabled = true;
		// Preserve SVG icon; swap to hourglass while request is in flight
		const svgIcon = btn.querySelector( 'svg' ) ? btn.querySelector( 'svg' ).cloneNode( true ) : null;
		btn.textContent = '\u231b';

		const restoreIcon = () => {
			btn.textContent = '';
			if ( svgIcon ) btn.appendChild( svgIcon.cloneNode( true ) );
		};

		fetch( ajaxurl, {
			method: 'POST',
			body:   new URLSearchParams( {
				action:      'wpte_devzone_delete_option',
				option_name: optionName,
				_ajax_nonce: nonce,
			} ),
		} )
			.then( ( r ) => r.json() )
			.then( ( res ) => {
				if ( res.success ) {
					const block = btn.closest( '.wte-dbg-option-block' );
					if ( block ) {
						block.style.transition = 'opacity 0.3s';
						block.style.opacity    = '0';
						setTimeout( () => block.remove(), 300 );
					}
				} else {
					btn.disabled = false;
					restoreIcon();
					// eslint-disable-next-line no-alert
					window.alert( 'Error: ' + ( res.data && res.data.message ? res.data.message : 'Delete failed' ) );
				}
			} )
			.catch( () => {
				btn.disabled = false;
				restoreIcon();
				// eslint-disable-next-line no-alert
				window.alert( 'Network error — could not delete option.' );
			} );
	}

	function savePostField( postId, field, value, selectEl ) {
		const body = new URLSearchParams( {
			action:      'wpte_devzone_save_post_field',
			post_id:     postId,
			field,
			value,
			_ajax_nonce: nonce,
		} );

		fetch( ajaxurl, { method: 'POST', body } )
			.then( ( r ) => r.json() )
			.then( ( res ) => {
				if ( res.success ) {
					const row = selectEl.closest( '.wte-dbg-row' );
					if ( row ) flash( row, 'flash-ok' );

					// Sync the sidebar list-item badge when post_status changes
					if ( field === 'post_status' ) {
						const listItem = document.querySelector( `.wte-dbg-list-item[data-post-id="${ postId }"]` );
						if ( listItem ) {
							const badge = listItem.querySelector( '.wte-dbg-status' );
							if ( badge ) {
								badge.className  = 'wte-dbg-status wte-dbg-status-' + value;
								badge.textContent = value;
							}
						}
					}
				}
			} );
	}

	// -----------------------------------------------------------------------
	// Flash feedback
	// -----------------------------------------------------------------------

	function flashSuccess( row, newValue ) {
		const input     = row.querySelector( '.wte-dbg-input' );
		const saveBtn   = row.querySelector( '.wte-dbg-save' );
		const cancelBtn = row.querySelector( '.wte-dbg-cancel' );

		if ( input ) {
			input.replaceWith( makeValueSpan( newValue ) );
		}
		if ( saveBtn )   saveBtn.remove();
		if ( cancelBtn ) cancelBtn.remove();
		row.appendChild( makeEditBtn() );

		flash( row, 'flash-ok' );
	}

	function flashError( row, message ) {
		flash( row, 'flash-err' );

		const existing = row.querySelector( '.wte-dbg-err-msg' );
		if ( existing ) existing.remove();

		const msg = document.createElement( 'span' );
		msg.className = 'wte-dbg-err-msg';
		msg.style.cssText = 'color:#8a1f1f;font-size:11px;margin-left:4px;';
		msg.textContent = message;
		row.appendChild( msg );
		setTimeout( () => msg.remove(), 3000 );
	}

	function flash( el, cls ) {
		el.classList.remove( cls );
		void el.offsetWidth;
		el.classList.add( cls );
		el.addEventListener( 'animationend', () => el.classList.remove( cls ), { once: true } );
	}

	// -----------------------------------------------------------------------
	// DOM helpers
	// -----------------------------------------------------------------------

	function buildRow() {
		const row = document.createElement( 'div' );
		row.className = 'wte-dbg-row';
		return row;
	}

	function makeKeySpan( text ) {
		const span = document.createElement( 'span' );
		span.className = 'wte-dbg-key';
		span.textContent = text;
		return span;
	}

	function makeValueSpan( raw ) {
		const span = document.createElement( 'span' );
		span.className = 'wte-dbg-value';
		span.dataset.raw = raw;
		span.textContent = formatScalar( raw );
		return span;
	}

	function makeEditBtn() {
		const btn = document.createElement( 'button' );
		btn.type = 'button';
		btn.className = 'wte-dbg-edit-btn';
		btn.title = 'Edit';
		btn.textContent = '\u270e';
		return btn;
	}

	function makeButton( text, className ) {
		const btn = document.createElement( 'button' );
		btn.type = 'button';
		btn.className = className;
		btn.textContent = text;
		return btn;
	}

	function makePara( className, text ) {
		const p = document.createElement( 'p' );
		p.className = className;
		p.textContent = text;
		return p;
	}

	function setTextContent( el, text ) {
		while ( el.firstChild ) el.removeChild( el.firstChild );
		if ( text ) el.textContent = text;
	}

	/**
	 * Stamp .is-stripe on every even-indexed .wte-dbg-row within a container,
	 * counting only sibling rows (skipping details.wte-dbg-node and others).
	 * Recurses into every nested .wte-dbg-children container independently.
	 */
	function applyRowStripes( container ) {
		let idx = 0;
		for ( const el of container.children ) {
			if ( el.classList.contains( 'wte-dbg-row' ) || el.classList.contains( 'wte-dbg-node' ) ) {
				el.classList.toggle( 'is-stripe', ( idx++ ) % 2 !== 0 );
			}
		}
		container.querySelectorAll( '.wte-dbg-children' ).forEach( applyRowStripes );
	}

	// -----------------------------------------------------------------------
	// Dark / light mode toggle
	// -----------------------------------------------------------------------

	function initThemeToggle() {
		const wrap = document.querySelector( '.wte-devzone-wrap' );
		const btn  = document.querySelector( '.wte-dbg-theme-toggle' );
		const icon = btn && btn.querySelector( '.wte-dbg-theme-icon' );
		const KEY  = 'wte_dbg_theme';

		if ( ! wrap || ! btn ) return;

		// Dark class already applied by the inline script in layout.php
		// (before first paint — no flash). Just sync the icon to match.
		if ( wrap.classList.contains( 'wte-dbg-dark' ) ) {
			if ( icon ) icon.textContent = '\u263e'; // ☾
		}

		btn.addEventListener( 'click', () => {
			const isDark = wrap.classList.toggle( 'wte-dbg-dark' );
			document.body.classList.toggle( 'wte-dbg-page-dark', isDark );
			if ( icon ) icon.textContent = isDark ? '\u263e' : '\u2600'; // ☾ / ☀
			localStorage.setItem( KEY, isDark ? 'dark' : 'light' );
		} );
	}

	function formatScalar( value ) {
		if ( value === null || value === undefined || value === '' ) {
			if ( value === '' ) return '(empty)';
			return '(null)';
		}
		if ( typeof value === 'boolean' ) return value ? 'true' : 'false';
		const str = String( value );
		return str.length > 120 ? str.substring( 0, 120 ) + '\u2026' : str;
	}

} )();
