<?php

namespace WPTravelEngineDevZone;

use WPTravelEngine\Utilities\ArrayUtility;

defined( 'ABSPATH' ) || exit;

class AjaxHandler {

	// Meta keys that must never be written via the Dev Zone.
	private const BLOCKED_META_KEYS = [
		'_wp_trash_meta_time',
		'_wp_trash_meta_status',
		'_wp_old_slug',
		'_edit_lock',
		'_edit_last',
	];

	private const BLOCKED_META_PREFIXES = [
		'_wp_',
	];

	public function register(): void {
		$actions = [
			'wpte_devzone_load_tab'        => 'load_tab',
			'wpte_devzone_get_options'     => 'get_options',
			'wpte_devzone_get_option'      => 'get_option_value',
			'wpte_devzone_save_option'     => 'save_option',
			'wpte_devzone_delete_option'   => 'delete_option_entry',
			'wpte_devzone_list_posts'      => 'list_posts',
			'wpte_devzone_get_post'        => 'get_post',
			'wpte_devzone_save_meta'       => 'save_meta',
			'wpte_devzone_save_post_field' => 'save_post_field',
			'wpte_devzone_db_tables'       => 'db_tables',
			'wpte_devzone_db_columns'      => 'db_columns',
			'wpte_devzone_db_query'        => 'db_query',
			'wpte_devzone_unserialize'     => 'unserialize_data',
		];

		foreach ( $actions as $action => $method ) {
			add_action( "wp_ajax_{$action}", [ $this, $method ] );
		}
	}

	// -------------------------------------------------------------------------
	// Security helpers
	// -------------------------------------------------------------------------

	private function verify(): void {
		check_ajax_referer( Admin::NONCE );
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( [ 'message' => 'Forbidden' ], 403 );
		}
	}

	private function is_meta_key_writable( string $key ): bool {
		if ( in_array( $key, self::BLOCKED_META_KEYS, true ) ) {
			return false;
		}
		foreach ( self::BLOCKED_META_PREFIXES as $prefix ) {
			if ( strpos( $key, $prefix ) === 0 ) {
				return false;
			}
		}
		return true;
	}

	// -------------------------------------------------------------------------
	// Endpoints
	// -------------------------------------------------------------------------

	public function load_tab(): void {
		$this->verify();

		$allowed = [ 'settings', 'trips', 'bookings', 'payment', 'customers', 'search' ];
		$tab     = sanitize_key( $_POST['tab'] ?? 'settings' );

		if ( ! in_array( $tab, $allowed, true ) ) {
			wp_send_json_error( [ 'message' => 'Invalid tab' ] );
		}

		$map = [
			'settings'  => WPTE_DEVZONE_DIR . 'templates/tab-overview.php',
			'trips'     => WPTE_DEVZONE_DIR . 'templates/tab-trips.php',
			'bookings'  => WPTE_DEVZONE_DIR . 'templates/tab-bookings.php',
			'payment'   => WPTE_DEVZONE_DIR . 'templates/tab-payments.php',
			'customers' => WPTE_DEVZONE_DIR . 'templates/tab-customers.php',
			'search'    => WPTE_DEVZONE_DIR . 'templates/tab-query.php',
		];

		ob_start();
		require $map[ $tab ];
		$html = ob_get_clean();

		wp_send_json_success( [ 'html' => $html, 'tab' => $tab ] );
	}

	public function get_options(): void {
		$this->verify();

		global $wpdb;

		$rows = $wpdb->get_results(
			"SELECT option_name, option_value FROM {$wpdb->options}
			 WHERE option_name LIKE 'wp_travel_engine_%'
			    OR option_name LIKE 'wptravelengine_%'
			 ORDER BY option_name ASC",
			ARRAY_A
		);

		$options = [];
		foreach ( $rows as $row ) {
			$options[ $row['option_name'] ] = maybe_unserialize( $row['option_value'] );
		}

		wp_send_json_success( [ 'options' => $options ] );
	}

	public function get_option_value(): void {
		$this->verify();

		$option_name = sanitize_key( $_GET['option_name'] ?? '' );

		if ( empty( $option_name ) ) {
			wp_send_json_error( [ 'message' => 'Missing option_name' ] );
		}

		if ( strpos( $option_name, 'wp_travel_engine_' ) !== 0 && strpos( $option_name, 'wptravelengine_' ) !== 0 ) {
			wp_send_json_error( [ 'message' => 'Option not allowed' ], 403 );
		}

		$value    = get_option( $option_name );
		$renderer = new Renderer();
		$count    = null;

		ob_start();
		if ( is_array( $value ) || is_object( $value ) ) {
			$arr   = (array) $value;
			$count = count( $arr );
			$renderer->render_tree( $arr, $option_name );
		} else {
			$raw     = is_null( $value ) ? '' : (string) $value;
			$display = $renderer->format_scalar( $value );
			?>
			<div class="wte-dbg-row"
				data-option-name="<?php echo esc_attr( $option_name ); ?>"
				data-path="">
				<span class="wte-dbg-key"><?php echo esc_html( $option_name ); ?></span>
				<span class="wte-dbg-value" data-raw="<?php echo esc_attr( $raw ); ?>"><?php echo esc_html( $display ); ?></span>
				<button class="wte-dbg-edit-btn" title="<?php esc_attr_e( 'Edit', 'wptravelengine-devzone' ); ?>">&#9998;</button>
			</div>
			<?php
		}
		$html = ob_get_clean();

		wp_send_json_success( [ 'html' => $html, 'count' => $count ] );
	}

	public function save_option(): void {
		$this->verify();

		$option_name = sanitize_key( $_POST['option_name'] ?? '' );
		$key_path    = sanitize_text_field( wp_unslash( $_POST['key_path'] ?? '' ) );
		$new_value   = wp_unslash( $_POST['value'] ?? '' );

		if ( empty( $option_name ) ) {
			wp_send_json_error( [ 'message' => 'Missing option_name' ] );
		}

		// Only allow wp_travel_engine_* and wptravelengine_* options
		if ( strpos( $option_name, 'wp_travel_engine_' ) !== 0 && strpos( $option_name, 'wptravelengine_' ) !== 0 ) {
			wp_send_json_error( [ 'message' => 'Option not allowed' ], 403 );
		}

		$current   = get_option( $option_name );
		$old_value = $current;

		if ( $key_path ) {
			$arr       = ArrayUtility::make( (array) $current );
			$new_value = $this->cast_value( $new_value, $arr->get( $key_path ) );
			$arr->set( $key_path, $new_value );
			$current   = $arr->value();
		} else {
			$new_value = $this->cast_value( $new_value, $current );
			$current   = $new_value;
		}

		$this->log_change( "option:{$option_name}" . ( $key_path ? ".{$key_path}" : '' ), $old_value, $new_value );

		update_option( $option_name, $current );
		wp_send_json_success( [ 'saved' => true ] );
	}

	public function delete_option_entry(): void {
		$this->verify();

		$option_name = sanitize_key( $_POST['option_name'] ?? '' );

		if ( empty( $option_name ) ) {
			wp_send_json_error( [ 'message' => 'Missing option_name' ] );
		}

		if ( strpos( $option_name, 'wp_travel_engine_' ) !== 0 && strpos( $option_name, 'wptravelengine_' ) !== 0 && strpos( $option_name, 'wpte_' ) !== 0 ) {
			wp_send_json_error( [ 'message' => 'Option not allowed' ], 403 );
		}

		$this->log_change( "option:{$option_name}", get_option( $option_name ), '(deleted)' );

		delete_option( $option_name );
		wp_send_json_success( [ 'deleted' => true ] );
	}

	public function list_posts(): void {
		$this->verify();

		$allowed_types = [ 'trip', 'booking', 'wte-payments', 'customer' ];
		$post_type     = sanitize_key( $_GET['post_type'] ?? 'trip' );

		if ( ! in_array( $post_type, $allowed_types, true ) ) {
			wp_send_json_error( [ 'message' => 'Invalid post type' ] );
		}

		$search = sanitize_text_field( wp_unslash( $_GET['search'] ?? '' ) );
		$page   = max( 1, intval( $_GET['paged'] ?? 1 ) );

		$query = new \WP_Query( [
			'post_type'      => $post_type,
			'post_status'    => array_keys( get_post_stati() ),
			'posts_per_page' => 30,
			'paged'          => $page,
			's'              => $search,
			'orderby'        => 'ID',
			'order'          => 'DESC',
		] );

		$posts = array_map( function ( \WP_Post $p ) {
			return [
				'id'     => $p->ID,
				'title'  => $p->post_title ?: "#$p->ID",
				'status' => $p->post_status,
				'date'   => $p->post_date,
			];
		}, $query->posts );

		wp_send_json_success( [
			'posts'       => $posts,
			'total'       => $query->found_posts,
			'total_pages' => $query->max_num_pages,
			'page'        => $page,
		] );
	}

	public function get_post(): void {
		$this->verify();

		$post_id = intval( $_GET['post_id'] ?? 0 );
		$post    = get_post( $post_id );

		if ( ! $post ) {
			wp_send_json_error( [ 'message' => 'Post not found' ] );
		}

		// All meta, single-value (unserialized)
		$raw_meta = get_post_meta( $post_id );
		$meta     = [];
		foreach ( $raw_meta as $key => $values ) {
			$meta[ $key ] = get_post_meta( $post_id, $key, true );
		}

		// Taxonomy terms
		$taxonomies = get_object_taxonomies( $post->post_type );
		$terms      = [];
		foreach ( $taxonomies as $tax ) {
			$t           = get_the_terms( $post_id, $tax );
			$terms[ $tax ] = ( $t && ! is_wp_error( $t ) ) ? wp_list_pluck( $t, 'name' ) : [];
		}

		wp_send_json_success( [
			'post'       => [
				'ID'           => $post->ID,
				'post_title'   => $post->post_title,
				'post_status'  => $post->post_status,
				'post_date'    => $post->post_date,
				'post_type'    => $post->post_type,
				'post_content' => $post->post_content,
			],
			'meta'       => $meta,
			'taxonomies' => $terms,
		] );
	}

	public function save_meta(): void {
		$this->verify();

		$post_id  = intval( $_POST['post_id'] ?? 0 );
		$meta_key = sanitize_text_field( wp_unslash( $_POST['meta_key'] ?? '' ) );
		$key_path = sanitize_text_field( wp_unslash( $_POST['key_path'] ?? '' ) );
		$value    = wp_unslash( $_POST['value'] ?? '' );

		if ( ! $post_id || ! $meta_key ) {
			wp_send_json_error( [ 'message' => 'Missing post_id or meta_key' ] );
		}
		if ( ! $this->is_meta_key_writable( $meta_key ) ) {
			wp_send_json_error( [ 'message' => "Meta key '{$meta_key}' is protected." ], 403 );
		}

		$current   = get_post_meta( $post_id, $meta_key, true );
		$old_value = $current;

		if ( $key_path ) {
			$arr       = ArrayUtility::make( (array) $current );
			$new_value = $this->cast_value( $value, $arr->get( $key_path ) );
			$arr->set( $key_path, $new_value );
			$current   = $arr->value();
		} else {
			$new_value = $this->cast_value( $value, $current );
			$current   = $new_value;
		}

		$this->log_change(
			"post_meta:{$post_id}.{$meta_key}" . ( $key_path ? ".{$key_path}" : '' ),
			$old_value,
			$new_value
		);

		update_post_meta( $post_id, $meta_key, $current );
		wp_send_json_success( [ 'saved' => true ] );
	}

	public function save_post_field(): void {
		$this->verify();

		$post_id = intval( $_POST['post_id'] ?? 0 );
		$field   = sanitize_key( $_POST['field'] ?? '' );
		$value   = sanitize_text_field( wp_unslash( $_POST['value'] ?? '' ) );

		$allowed_fields = [ 'post_title', 'post_status', 'post_date' ];
		if ( ! $post_id || ! in_array( $field, $allowed_fields, true ) ) {
			wp_send_json_error( [ 'message' => 'Invalid field or post_id' ] );
		}

		$post = get_post( $post_id );
		if ( ! $post ) {
			wp_send_json_error( [ 'message' => 'Post not found' ] );
		}

		$old_value = $post->$field;
		$this->log_change( "post_field:{$post_id}.{$field}", $old_value, $value );

		wp_update_post( [
			'ID'    => $post_id,
			$field  => $value,
		] );

		wp_send_json_success( [ 'saved' => true ] );
	}

	// -------------------------------------------------------------------------
	// DB Search endpoints
	// -------------------------------------------------------------------------

	public function db_tables(): void {
		$this->verify();

		global $wpdb;

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
		$tables         = $wpdb->get_col( 'SHOW TABLES' );
		$wp_core_tables = array_values( $wpdb->tables( 'all', true ) );
		$result         = [];

		foreach ( $tables as $table ) {
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
			$count    = (int) $wpdb->get_var( "SELECT COUNT(*) FROM `{$table}`" ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$result[] = [
				'name'  => $table,
				'rows'  => $count,
				'group' => $this->classify_table( $table, $wp_core_tables ),
			];
		}

		// Sort: WTE tables first, then WP core, then everything else; alpha within each group.
		$order = [ 'wte' => 0, 'wp' => 1, 'other' => 2 ];
		usort( $result, function ( $a, $b ) use ( $order ) {
			$diff = ( $order[ $a['group'] ] ?? 2 ) - ( $order[ $b['group'] ] ?? 2 );
			return $diff !== 0 ? $diff : strcmp( $a['name'], $b['name'] );
		} );

		wp_send_json_success( [ 'tables' => $result ] );
	}

	/**
	 * Classify a table name into 'wte', 'wp', or 'other'.
	 *
	 * @param string   $table          Full table name (includes DB prefix).
	 * @param string[] $wp_core_tables List of WP core table names from $wpdb->tables().
	 */
	private function classify_table( string $table, array $wp_core_tables ): string {
		if (
			strpos( $table, 'wptravelengine' ) !== false ||
			strpos( $table, 'travel_engine' ) !== false ||
			strpos( $table, 'wte_' ) !== false
		) {
			return 'wte';
		}
		if ( in_array( $table, $wp_core_tables, true ) ) {
			return 'wp';
		}
		return 'other';
	}

	public function db_columns(): void {
		$this->verify();

		global $wpdb;

		$table = sanitize_text_field( wp_unslash( $_GET['table'] ?? '' ) );

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
		$tables = $wpdb->get_col( 'SHOW TABLES' );
		if ( ! in_array( $table, $tables, true ) ) {
			wp_send_json_error( [ 'message' => 'Table not found' ], 404 );
		}

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$columns = $wpdb->get_results( "SHOW COLUMNS FROM `{$table}`", ARRAY_A );

		wp_send_json_success( [ 'columns' => $columns ] );
	}

	public function db_query(): void {
		$this->verify();

		global $wpdb;

		$table   = sanitize_text_field( wp_unslash( $_GET['table'] ?? '' ) );
		$filters = (array) ( $_GET['filters'] ?? [] );
		$limit   = min( 200, max( 1, intval( $_GET['limit'] ?? 50 ) ) );
		$offset  = max( 0, intval( $_GET['offset'] ?? 0 ) );

		// Validate table name against actual tables
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
		$tables = $wpdb->get_col( 'SHOW TABLES' );
		if ( ! in_array( $table, $tables, true ) ) {
			wp_send_json_error( [ 'message' => 'Table not found' ], 404 );
		}

		// Get valid column names
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$valid_columns = $wpdb->get_col( "SHOW COLUMNS FROM `{$table}`" );

		$allowed_ops = [ '=', '!=', 'LIKE', 'NOT LIKE', '>', '<', '>=', '<=', 'IS NULL', 'IS NOT NULL' ];

		$where_parts = [];

		foreach ( $filters as $filter ) {
			$col = $filter['column'] ?? '';
			$op  = strtoupper( trim( $filter['operator'] ?? '=' ) );
			$val = wp_unslash( $filter['value'] ?? '' );

			if ( ! in_array( $col, $valid_columns, true ) ) {
				continue;
			}
			if ( ! in_array( $op, $allowed_ops, true ) ) {
				continue;
			}

			if ( 'IS NULL' === $op || 'IS NOT NULL' === $op ) {
				$where_parts[] = "`{$col}` {$op}";
			} elseif ( 'LIKE' === $op || 'NOT LIKE' === $op ) {
				$where_parts[] = $wpdb->prepare( "`{$col}` {$op} %s", '%' . $wpdb->esc_like( $val ) . '%' ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			} else {
				$where_parts[] = $wpdb->prepare( "`{$col}` {$op} %s", $val ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			}
		}

		$where = $where_parts ? 'WHERE ' . implode( ' AND ', $where_parts ) : '';

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared,WordPress.DB.PreparedSQL.NotPrepared
		$total = (int) $wpdb->get_var( "SELECT COUNT(*) FROM `{$table}` {$where}" );
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared,WordPress.DB.PreparedSQL.NotPrepared
		$rows  = $wpdb->get_results( "SELECT * FROM `{$table}` {$where} LIMIT {$limit} OFFSET {$offset}", ARRAY_A );

		wp_send_json_success( [
			'rows'   => $rows,
			'total'  => $total,
			'limit'  => $limit,
			'offset' => $offset,
		] );
	}

	public function unserialize_data(): void {
		$this->verify();

		$raw     = wp_unslash( $_POST['data'] ?? '' );
		$trimmed = trim( $raw );

		// 1. Try JSON
		if ( str_starts_with( $trimmed, '{' ) || str_starts_with( $trimmed, '[' ) ) {
			$decoded = json_decode( $raw, true );
			if ( json_last_error() === JSON_ERROR_NONE ) {
				wp_send_json_success( [ 'tree' => $decoded, 'format' => 'json' ] );
				return;
			}
		}

		// 2. Try PHP unserialize
		$unserialized = maybe_unserialize( $raw );
		if ( $unserialized !== $raw ) {
			wp_send_json_success( [ 'tree' => $unserialized, 'format' => 'php' ] );
			return;
		}

		// 3. Try Base64
		$decoded = base64_decode( $trimmed, true );
		if ( $decoded !== false && mb_detect_encoding( $decoded, 'UTF-8', true ) ) {
			$inner = trim( $decoded );
			if ( str_starts_with( $inner, '{' ) || str_starts_with( $inner, '[' ) ) {
				$json = json_decode( $decoded, true );
				if ( json_last_error() === JSON_ERROR_NONE ) {
					wp_send_json_success( [ 'tree' => $json, 'format' => 'base64+json' ] );
					return;
				}
			}
			$unserialized = maybe_unserialize( $decoded );
			if ( $unserialized !== $decoded ) {
				wp_send_json_success( [ 'tree' => $unserialized, 'format' => 'base64+php' ] );
				return;
			}
			wp_send_json_success( [ 'tree' => $decoded, 'format' => 'base64' ] );
			return;
		}

		// 4. Try URL query string
		if ( str_contains( $trimmed, '=' ) && ( str_contains( $trimmed, '%' ) || str_contains( $trimmed, '&' ) || str_contains( $trimmed, '+' ) ) ) {
			parse_str( $trimmed, $parsed );
			if ( count( $parsed ) >= 2 ) {
				wp_send_json_success( [ 'tree' => $parsed, 'format' => 'url' ] );
				return;
			}
		}

		// 5. Unknown format — return raw string with fallback flag
		wp_send_json_success( [ 'tree' => $raw, 'format' => 'unknown' ] );
	}

	// -------------------------------------------------------------------------
	// Value helpers
	// -------------------------------------------------------------------------

	/**
	 * Cast the incoming string value to match the type of the existing value.
	 */
	private function cast_value( $new, $existing ): mixed {
		if ( is_int( $existing ) ) {
			return intval( $new );
		}
		if ( is_float( $existing ) ) {
			return floatval( $new );
		}
		if ( is_bool( $existing ) ) {
			return filter_var( $new, FILTER_VALIDATE_BOOLEAN );
		}
		if ( is_array( $existing ) || is_object( $existing ) ) {
			$decoded = json_decode( $new, true );
			return json_last_error() === JSON_ERROR_NONE ? $decoded : $new;
		}
		return sanitize_textarea_field( $new );
	}

	/**
	 * Log a change to WordPress debug log.
	 * If WTE has its own logging mechanism it can be integrated here.
	 */
	private function log_change( string $field, $old, $new ): void {
		if ( ! defined( 'WP_DEBUG_LOG' ) || ! WP_DEBUG_LOG ) {
			return;
		}
		$user    = wp_get_current_user();
		$message = sprintf(
			'[WTE Dev Zone] user=%s field=%s before=%s after=%s',
			$user->user_login,
			$field,
			is_scalar( $old ) ? (string) $old : wp_json_encode( $old ),
			is_scalar( $new ) ? (string) $new : wp_json_encode( $new )
		);
		// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
		error_log( $message );
	}
}
