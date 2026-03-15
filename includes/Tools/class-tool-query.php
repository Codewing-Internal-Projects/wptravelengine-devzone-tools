<?php

namespace WPTravelEngineDevZone\Tools;

use WPTravelEngineDevZone\Admin;

defined( 'ABSPATH' ) || exit;

class ToolQuery extends AbstractTool {

	public function get_slug(): string     { return 'query'; }
	public function get_label(): string    { return __( 'Query', 'wptravelengine-devzone' ); }
	public function get_template(): string { return WPTE_DEVZONE_DIR . 'templates/tab-query.php'; }

	public function register_ajax(): void {
		$actions = [
			'wpte_devzone_db_tables'  => 'db_tables',
			'wpte_devzone_db_columns' => 'db_columns',
			'wpte_devzone_db_query'   => 'db_query',
			'wpte_devzone_db_action'  => 'db_action',
		];
		foreach ( $actions as $action => $method ) {
			add_action( "wp_ajax_{$action}", [ $this, $method ] );
		}
	}

	public function enqueue_assets(): void {
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
	}

	// -------------------------------------------------------------------------
	// Endpoints
	// -------------------------------------------------------------------------

	public function db_tables(): void {
		Admin::verify_request();

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

	public function db_columns(): void {
		Admin::verify_request();

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
		Admin::verify_request();

		global $wpdb;

		$table   = sanitize_text_field( wp_unslash( $_GET['table'] ?? '' ) );
		$filters = (array) ( $_GET['filters'] ?? [] );
		$limit   = min( 200, max( 1, intval( $_GET['limit'] ?? 50 ) ) );
		$offset  = max( 0, intval( $_GET['offset'] ?? 0 ) );

		// Validate table name against actual tables.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
		$tables = $wpdb->get_col( 'SHOW TABLES' );
		if ( ! in_array( $table, $tables, true ) ) {
			wp_send_json_error( [ 'message' => 'Table not found' ], 404 );
		}

		// Get valid column names.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$valid_columns = $wpdb->get_col( "SHOW COLUMNS FROM `{$table}`" );

		$where_parts = $this->_build_where_parts( $filters, $valid_columns );
		$where       = $where_parts ? 'WHERE ' . implode( ' AND ', $where_parts ) : '';

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

	public function db_action(): void {
		Admin::verify_request();

		global $wpdb;

		$type  = sanitize_text_field( wp_unslash( $_GET['type'] ?? '' ) );
		$table = sanitize_text_field( wp_unslash( $_GET['table'] ?? '' ) );

		if ( ! in_array( $type, [ 'add', 'update', 'delete' ], true ) ) {
			wp_send_json_error( [ 'message' => 'Invalid action type' ], 400 );
		}

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
		$tables = $wpdb->get_col( 'SHOW TABLES' );
		if ( ! in_array( $table, $tables, true ) ) {
			wp_send_json_error( [ 'message' => 'Table not found' ], 404 );
		}

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$valid_columns = $wpdb->get_col( "SHOW COLUMNS FROM `{$table}`" );

		if ( 'add' === $type ) {
			$this->_execute_insert( $table, $valid_columns );
		} elseif ( 'update' === $type ) {
			$this->_execute_update( $table, $valid_columns );
		} else {
			$this->_execute_delete( $table, $valid_columns );
		}
	}

	// -------------------------------------------------------------------------
	// Helpers
	// -------------------------------------------------------------------------

	private function _build_where_parts( array $raw_filters, array $valid_columns ): array {
		global $wpdb;
		$allowed_ops = [ '=', '!=', 'LIKE', 'NOT LIKE', '>', '<', '>=', '<=', 'IS NULL', 'IS NOT NULL' ];
		$parts       = [];
		foreach ( $raw_filters as $filter ) {
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
				$parts[] = "`{$col}` {$op}";
			} elseif ( 'LIKE' === $op || 'NOT LIKE' === $op ) {
				$parts[] = $wpdb->prepare( "`{$col}` {$op} %s", '%' . $wpdb->esc_like( $val ) . '%' ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			} else {
				$parts[] = $wpdb->prepare( "`{$col}` {$op} %s", $val ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			}
		}
		return $parts;
	}

	private function _execute_insert( string $table, array $valid_columns ): void {
		global $wpdb;

		$raw  = (array) ( $_GET['columns'] ?? [] ); // phpcs:ignore WordPress.Security.NonceVerification
		$data = [];
		foreach ( $raw as $col => $val ) {
			$col = sanitize_text_field( $col );
			if ( in_array( $col, $valid_columns, true ) ) {
				$data[ $col ] = wp_unslash( (string) $val );
			}
		}

		if ( empty( $data ) ) {
			wp_send_json_error( [ 'message' => 'No valid columns provided' ], 400 );
		}

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery
		$result = $wpdb->insert( $table, $data );

		if ( false === $result ) {
			wp_send_json_error( [ 'message' => 'Insert failed: ' . $wpdb->last_error ], 500 );
		}

		wp_send_json_success( [ 'message' => 'Row inserted (ID: ' . $wpdb->insert_id . ')' ] );
	}

	private function _execute_update( string $table, array $valid_columns ): void {
		global $wpdb;

		$where_col = sanitize_text_field( wp_unslash( $_GET['where_column'] ?? '' ) );
		$where_val = wp_unslash( $_GET['where_value'] ?? '' );

		if ( ! in_array( $where_col, $valid_columns, true ) ) {
			wp_send_json_error( [ 'message' => 'where_column is required for UPDATE' ], 400 );
		}

		$raw  = (array) ( $_GET['columns'] ?? [] ); // phpcs:ignore WordPress.Security.NonceVerification
		$data = [];
		foreach ( $raw as $col => $val ) {
			$col = sanitize_text_field( $col );
			if ( in_array( $col, $valid_columns, true ) ) {
				$data[ $col ] = wp_unslash( (string) $val );
			}
		}

		if ( empty( $data ) ) {
			wp_send_json_error( [ 'message' => 'No valid columns provided' ], 400 );
		}

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery
		$result = $wpdb->update( $table, $data, [ $where_col => $where_val ] );

		if ( false === $result ) {
			wp_send_json_error( [ 'message' => 'Update failed: ' . $wpdb->last_error ], 500 );
		}

		wp_send_json_success( [ 'message' => $result . ' row(s) updated' ] );
	}

	private function _execute_delete( string $table, array $valid_columns ): void {
		global $wpdb;

		$where_col = sanitize_text_field( wp_unslash( $_GET['where_column'] ?? '' ) );
		$where_val = wp_unslash( $_GET['where_value'] ?? '' );

		if ( ! in_array( $where_col, $valid_columns, true ) ) {
			wp_send_json_error( [ 'message' => 'where_column is required for DELETE' ], 400 );
		}

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery
		$result = $wpdb->delete( $table, [ $where_col => $where_val ] );

		if ( false === $result ) {
			wp_send_json_error( [ 'message' => 'Delete failed: ' . $wpdb->last_error ], 500 );
		}

		wp_send_json_success( [ 'message' => $result . ' row(s) deleted' ] );
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
}
