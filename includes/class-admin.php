<?php

namespace WPTravelEngineDevZone;

defined( 'ABSPATH' ) || exit;

class Admin {

	public const PAGE_SLUG = 'wptravelengine-devzone';
	public const NONCE       = 'wpte_devzone_nonce';

	public function __construct() {
		add_action( 'admin_menu', [ $this, 'register_menu' ] );
		add_action( 'admin_enqueue_scripts', [ $this, 'enqueue_assets' ] );
		add_action( 'admin_enqueue_scripts', [ $this, 'maybe_show_activation_pointer' ] );
		add_action( 'current_screen', [ $this, 'suppress_notices_on_our_page' ] );

		$handler = new AjaxHandler();
		$handler->register();
	}

	/**
	 * Remove all admin notice hooks when viewing the Dev Zone page so the UI
	 * stays clean and uncluttered by unrelated plugin/theme notices.
	 */
	public function suppress_notices_on_our_page( \WP_Screen $screen ): void {
		if ( strpos( $screen->id, self::PAGE_SLUG ) === false ) {
			return;
		}
		remove_all_actions( 'admin_notices' );
		remove_all_actions( 'all_admin_notices' );
		remove_all_actions( 'user_admin_notices' );
		remove_all_actions( 'network_admin_notices' );
	}

	public function register_menu(): void {
		add_submenu_page(
			'tools.php',
			__( 'WP Travel Engine Dev Zone', 'wptravelengine-devzone' ),
			__( 'WPTE Dev Zone', 'wptravelengine-devzone' ),
			'manage_options',
			self::PAGE_SLUG,
			[ $this, 'render_page' ]
		);
	}

	public function maybe_show_activation_pointer(): void {
		if ( 'wptravelengine-devzone' === ( $_GET['page'] ?? '' ) ) {
			return;
		}

		$pointer_id = 'wpte_devzone_activation_v1';
		$dismissed  = explode( ',', (string) get_user_meta( get_current_user_id(), 'dismissed_wp_pointers', true ) );

		if ( \in_array( $pointer_id, $dismissed, true ) ) {
			return;
		}

		wp_add_inline_script(
			'common',
			\sprintf(
				'(function(){
					var css=[
						"#wte-dz-tip{position:absolute;z-index:9999;width:260px;background:#fff;border:1px solid #c3c4c7;border-radius:6px;box-shadow:0 4px 20px rgba(0,0,0,.18);overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;}",
						".wte-dz-head{background:#1d2327;padding:10px 14px;display:flex;align-items:center;gap:8px;position:relative;}",
						".wte-dz-title{color:#fff;font-size:13px;font-weight:600;margin:0;line-height:1.4;flex:1;}",
						".wte-dz-close{background:none;border:none;color:rgba(255,255,255,.6);font-size:18px;line-height:1;cursor:pointer;padding:0;margin-left:auto;}",
						".wte-dz-close:hover{color:#fff;}",
						".wte-dz-body{padding:12px 14px 14px;}",
						".wte-dz-msg{margin:0 0 12px;font-size:12px;color:#50575e;line-height:1.6;}",
						".wte-dz-foot{text-align:right;}",
						".wte-dz-btn{background:#2271b1;color:#fff;border:none;border-radius:3px;padding:5px 14px;font-size:13px;cursor:pointer;}",
						".wte-dz-btn:hover{background:#135e96;}"
					].join("");
					var st=document.createElement("style");st.textContent=css;document.head.appendChild(st);
					document.addEventListener("DOMContentLoaded",function(){
						var anchor=document.querySelector("#menu-tools > a");
						if(!anchor)return;
						var tip=document.createElement("div");tip.id="wte-dz-tip";
						var cb=document.createElement("div");
						cb.style.cssText="position:absolute;left:-9px;top:50%%;transform:translateY(-50%%);width:0;height:0;border:9px solid transparent;border-left:0;border-right-color:#c3c4c7;";
						var cf=document.createElement("div");
						cf.style.cssText="position:absolute;left:-8px;top:50%%;transform:translateY(-50%%);width:0;height:0;border:8px solid transparent;border-left:0;border-right-color:#fff;";
						var head=document.createElement("div");head.className="wte-dz-head";
						var ns="http://www.w3.org/2000/svg";
						var icon=document.createElementNS(ns,"svg");
						icon.setAttribute("width","16");icon.setAttribute("height","16");icon.setAttribute("viewBox","0 0 24 24");
						var path=document.createElementNS(ns,"path");
						path.setAttribute("fill","#a7aaad");
						path.setAttribute("d","M20 8h-2.81c-.45-.78-1.07-1.45-1.82-1.96L17 4.41 15.59 3l-2.17 2.17C13.03 5.06 12.52 5 12 5c-.52 0-1.03.06-1.52.17L8.41 3 7 4.41l1.62 1.63C7.88 6.55 7.26 7.22 6.81 8H4v2h2.09c-.05.33-.09.66-.09 1v1H4v2h2v1c0 .34.04.67.09 1H4v2h2.81c1.04 1.79 2.97 3 5.19 3s4.15-1.21 5.19-3H20v-2h-2.09c.05-.33.09-.66.09-1v-1h2v-2h-2v-1c0-.34-.04-.67-.09-1H20V8zm-6 8h-4v-2h4v2zm0-4h-4v-2h4v2z");
						icon.appendChild(path);
						var titleEl=document.createElement("strong");titleEl.className="wte-dz-title";titleEl.textContent=%s;
						var closeBtn=document.createElement("button");closeBtn.type="button";closeBtn.className="wte-dz-close";closeBtn.textContent="\u00d7";
						head.appendChild(icon);head.appendChild(titleEl);head.appendChild(closeBtn);
						var body=document.createElement("div");body.className="wte-dz-body";
						var msg=document.createElement("p");msg.className="wte-dz-msg";msg.textContent=%s;
						var foot=document.createElement("div");foot.className="wte-dz-foot";
						var visitBtn=document.createElement("button");visitBtn.type="button";visitBtn.className="wte-dz-btn";visitBtn.textContent=%s;
						foot.appendChild(visitBtn);body.appendChild(msg);body.appendChild(foot);
						tip.appendChild(cb);tip.appendChild(cf);tip.appendChild(head);tip.appendChild(body);
						var r=anchor.getBoundingClientRect();
						tip.style.top=(r.top+window.scrollY+r.height/2-60)+"px";
						tip.style.left=(r.right+12)+"px";
						document.body.appendChild(tip);
						function dismiss(){
							tip.remove();st.remove();
							fetch(ajaxurl,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:"action=dismiss-wp-pointer&pointer="+%s});
						}
						closeBtn.addEventListener("click",dismiss);
						visitBtn.addEventListener("click",function(){
							dismiss();
							window.location.href=%s;
						});
					});
				})();',
				wp_json_encode( __( 'WP Travel Engine Dev Zone', 'wptravelengine-devzone' ) ),
				wp_json_encode( __( 'Active and ready! Find it here under Tools → WTE Dev Zone.', 'wptravelengine-devzone' ) ),
				wp_json_encode( __( 'Visit', 'wptravelengine-devzone' ) ),
				wp_json_encode( $pointer_id ),
				wp_json_encode( admin_url( 'tools.php?page=' . self::PAGE_SLUG ) )
			)
		);
	}

	public function enqueue_assets( string $hook ): void {
		// Only load on our admin page
		if ( strpos( $hook, self::PAGE_SLUG ) === false ) {
			return;
		}

		wp_enqueue_style(
			'wpte-devzone',
			WPTE_DEVZONE_URL . 'assets/css/devzone.css',
			[],
			WPTE_DEVZONE_VERSION
		);

		wp_enqueue_script(
			'wpte-devzone',
			WPTE_DEVZONE_URL . 'assets/js/devzone.js',
			[],
			WPTE_DEVZONE_VERSION,
			true
		);

		wp_enqueue_style(
			'wpte-devzone-search',
			WPTE_DEVZONE_URL . 'assets/css/db-search.css',
			[ 'wpte-devzone' ],
			WPTE_DEVZONE_VERSION
		);
		wp_enqueue_script(
			'wpte-devzone-search',
			WPTE_DEVZONE_URL . 'assets/js/db-search.js',
			[ 'wpte-devzone' ],
			WPTE_DEVZONE_VERSION,
			true
		);

		wp_localize_script( 'wpte-devzone', 'wpteDbg', [
			'ajaxurl'    => admin_url( 'admin-ajax.php' ),
			'nonce'      => wp_create_nonce( self::NONCE ),
			'post_types' => [
				'trip'         => __( 'Trips', 'wptravelengine-devzone' ),
				'booking'      => __( 'Bookings', 'wptravelengine-devzone' ),
				'wte-payments' => __( 'Payments', 'wptravelengine-devzone' ),
				'customer'     => __( 'Customers', 'wptravelengine-devzone' ),
			],
		] );
	}

	public function render_page(): void {
		require WPTE_DEVZONE_DIR . 'templates/layout.php';
	}
}
