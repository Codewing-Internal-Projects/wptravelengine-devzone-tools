/**
 * WPTE Dev Zone — DomHelper
 * Static DOM utility methods shared across tab modules.
 */

export class DomHelper {
	static buildRow() {
		const row = document.createElement( 'div' );
		row.className = 'wte-dbg-row';
		return row;
	}

	static makeKeySpan( text ) {
		const span = document.createElement( 'span' );
		span.className = 'wte-dbg-key';
		span.textContent = text;
		return span;
	}

	static makeValueSpan( raw ) {
		const span = document.createElement( 'span' );
		span.className = 'wte-dbg-value';
		span.dataset.raw = raw;
		span.textContent = DomHelper.formatScalar( raw );
		return span;
	}

	static makeEditBtn() {
		const btn = document.createElement( 'button' );
		btn.type = 'button';
		btn.className = 'wte-dbg-edit-btn';
		btn.title = 'Edit';
		btn.textContent = '\u270e';
		return btn;
	}

	static makeButton( text, className ) {
		const btn = document.createElement( 'button' );
		btn.type = 'button';
		btn.className = className;
		btn.textContent = text;
		return btn;
	}

	static makePara( className, text ) {
		const p = document.createElement( 'p' );
		p.className = className;
		p.textContent = text;
		return p;
	}

	static setTextContent( el, text ) {
		while ( el.firstChild ) el.removeChild( el.firstChild );
		if ( text ) el.textContent = text;
	}

	/**
	 * Safely insert server-rendered HTML into an element, then re-execute any
	 * inline <script> tags. insertAdjacentHTML intentionally does not run scripts;
	 * cloning them into fresh DOM <script> nodes is the standard workaround.
	 */
	static setServerHtml( el, html ) {
		DomHelper.setTextContent( el, '' );
		el.insertAdjacentHTML( 'beforeend', html );
		el.querySelectorAll( 'script' ).forEach( ( oldScript ) => {
			const newScript = document.createElement( 'script' );
			[ ...oldScript.attributes ].forEach( ( a ) => newScript.setAttribute( a.name, a.value ) );
			newScript.textContent = oldScript.textContent;
			oldScript.replaceWith( newScript );
		} );
	}

	/**
	 * Stamp .is-stripe on every even-indexed .wte-dbg-row within a container,
	 * counting only sibling rows (skipping details.wte-dbg-node and others).
	 * Recurses into every nested .wte-dbg-children container independently.
	 */
	static applyRowStripes( container ) {
		let idx = 0;
		for ( const el of container.children ) {
			if ( el.classList.contains( 'wte-dbg-row' ) || el.classList.contains( 'wte-dbg-node' ) ) {
				el.classList.toggle( 'is-stripe', ( idx++ ) % 2 !== 0 );
			}
		}
		container.querySelectorAll( '.wte-dbg-children' ).forEach( DomHelper.applyRowStripes );
	}

	static buildPagination( paginEl, page, totalPages, onPage ) {
		DomHelper.setTextContent( paginEl, '' );
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

	/**
	 * Full-content spinner overlay shown while a tab AJAX request is in flight.
	 * Covers .wte-dbg-content absolutely with a centred spinner + status note.
	 */
	static makeLoader( msg ) {
		DomHelper.setStatus( msg || 'Loading\u2026' );

		const wrap = document.createElement( 'div' );
		wrap.className = 'wte-dbg-loader';

		const spinner = document.createElement( 'div' );
		spinner.className = 'wte-dbg-loader-spinner';
		wrap.appendChild( spinner );

		return wrap;
	}

	/** Show the global status note with a message. type: 'info' | 'success' | 'error' | 'cancelled' */
	static setStatus( msg, type = null, secs = null ) {
		const wrap = document.getElementById( 'wte-dbg-status-note' );
		if ( ! wrap ) return;
		wrap.querySelector( '.wte-dbg-loader-note' ).textContent = msg;
		wrap.classList.remove( 'is-status-info', 'is-status-success', 'is-status-error', 'is-status-cancelled' );
		if ( type ) wrap.classList.add( 'is-status-' + type );
		wrap.classList.add( 'is-visible' );
		clearTimeout( DomHelper._statusTimer );
		if ( secs ) DomHelper._statusTimer = setTimeout( () => DomHelper.clearStatus(), secs * 1000 );
	}

	/** Hide the global status note and reset its type. */
	static clearStatus() {
		clearTimeout( DomHelper._statusTimer );
		const wrap = document.getElementById( 'wte-dbg-status-note' );
		if ( ! wrap ) return;
		wrap.classList.remove( 'is-visible', 'is-status-info', 'is-status-success', 'is-status-error', 'is-status-cancelled' );
	}

	/** Update cycling note text with fade transition (used by outer loader timer). */
	static updateLoaderNote( msg ) {
		const wrap = document.getElementById( 'wte-dbg-status-note' );
		if ( ! wrap ) return;
		const note = wrap.querySelector( '.wte-dbg-loader-note' );
		note.classList.add( 'is-changing' );
		setTimeout( () => {
			note.textContent = msg;
			note.classList.remove( 'is-changing' );
		}, 150 );
	}

	/**
	 * Append an inline shimmer + status note directly to a container.
	 * The note is a sibling of the shimmer (not nested inside it) so that
	 * position:absolute top:50% right:18px anchors to the container itself.
	 */
	static appendShimmer( container, count, msg ) {
		const lines = count || 4;
		const wrap  = document.createElement( 'div' );
		wrap.className = 'wte-dbg-shimmer-lines';
		const widths = [ '90%', '75%', '85%', '65%', '80%', '70%' ];
		for ( let i = 0; i < lines; i++ ) {
			const b = document.createElement( 'div' );
			b.className = 'wte-dbg-loader-block';
			b.style.cssText = `width:${ widths[ i % widths.length ] };height:18px;animation-delay:${ ( i * 0.1 ).toFixed( 1 ) }s`;
			wrap.appendChild( b );
		}
		container.appendChild( wrap );

		if ( msg ) DomHelper.setStatus( msg, 'info' );
	}

	static formatScalar( value ) {
		if ( value === null || value === undefined || value === '' ) {
			if ( value === '' ) return '(empty)';
			return '(null)';
		}
		if ( typeof value === 'boolean' ) return value ? 'true' : 'false';
		const str = String( value );
		return str.length > 120 ? str.substring( 0, 120 ) + '\u2026' : str;
	}
}
