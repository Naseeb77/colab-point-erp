<?php
/**
 * Plugin Name:       CoLab Point Connect
 * Description:       Connects colabpoint.com to the CoLab Point workspace app: live packages, enquiry form (goes to Leads), joining form link, member login button and social links.
 * Version:           1.0.0
 * Requires at least: 5.8
 * Requires PHP:      7.4
 * Author:            CoLab Point
 * License:           GPL-2.0-or-later
 * Text Domain:       colabpoint-connect
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class CoLab_Point_Connect {
	const OPT = 'colabpoint_connect';

	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'admin_menu' ) );
		add_action( 'admin_init', array( __CLASS__, 'register_settings' ) );
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'styles' ) );
		add_action( 'admin_post_nopriv_colabpoint_enquiry', array( __CLASS__, 'handle_enquiry' ) );
		add_action( 'admin_post_colabpoint_enquiry', array( __CLASS__, 'handle_enquiry' ) );
		add_shortcode( 'colabpoint_packages', array( __CLASS__, 'sc_packages' ) );
		add_shortcode( 'colabpoint_enquiry', array( __CLASS__, 'sc_enquiry' ) );
		add_shortcode( 'colabpoint_join_button', array( __CLASS__, 'sc_join' ) );
		add_shortcode( 'colabpoint_login_button', array( __CLASS__, 'sc_login' ) );
		add_shortcode( 'colabpoint_social', array( __CLASS__, 'sc_social' ) );
	}

	/* ---------- settings ---------- */

	public static function defaults() {
		return array(
			'supabase_url' => 'https://fwbzugaebdecuypoajvg.supabase.co',
			'supabase_key' => 'sb_publishable_5e1_j0xTgHwvo3UH1eWJ2w_Ten5MJCd',
			'app_url'      => 'https://app.colabpoint.com',
			'whatsapp'     => '923497684322',
			'accent'       => '#f2c200',
		);
	}

	public static function opt( $key ) {
		$o = wp_parse_args( (array) get_option( self::OPT, array() ), self::defaults() );
		return $o[ $key ] ?? '';
	}

	public static function admin_menu() {
		add_options_page( 'CoLab Point Connect', 'CoLab Point', 'manage_options', 'colabpoint-connect', array( __CLASS__, 'settings_page' ) );
	}

	public static function register_settings() {
		register_setting(
			'colabpoint_connect',
			self::OPT,
			array(
				'sanitize_callback' => function ( $in ) {
					$out = array();
					$out['supabase_url'] = esc_url_raw( $in['supabase_url'] ?? '' );
					$out['supabase_key'] = sanitize_text_field( $in['supabase_key'] ?? '' );
					$out['app_url']      = esc_url_raw( untrailingslashit( $in['app_url'] ?? '' ) );
					$out['whatsapp']     = preg_replace( '/\D/', '', $in['whatsapp'] ?? '' );
					$out['accent']       = sanitize_hex_color( $in['accent'] ?? '' ) ?: '#f2c200';
					delete_transient( 'colabpoint_plans' );
					delete_transient( 'colabpoint_social' );
					return $out;
				},
			)
		);
	}

	public static function settings_page() {
		?>
		<div class="wrap">
			<h1>CoLab Point Connect</h1>
			<form method="post" action="options.php">
				<?php settings_fields( 'colabpoint_connect' ); ?>
				<table class="form-table" role="presentation">
					<?php
					$fields = array(
						'app_url'      => array( 'Workspace app URL', 'Where the CoLab Point app is installed, e.g. https://app.colabpoint.com' ),
						'whatsapp'     => array( 'WhatsApp number', 'International format without +, e.g. 923497684322' ),
						'accent'       => array( 'Button colour', 'Hex colour, e.g. #f2c200' ),
						'supabase_url' => array( 'Database URL', 'Public project URL (already filled in).' ),
						'supabase_key' => array( 'Publishable key', 'Public key (already filled in). Never paste a secret/service key here.' ),
					);
					foreach ( $fields as $k => $f ) :
						?>
						<tr><th scope="row"><label for="cp-<?php echo esc_attr( $k ); ?>"><?php echo esc_html( $f[0] ); ?></label></th>
						<td><input class="regular-text" id="cp-<?php echo esc_attr( $k ); ?>" name="<?php echo esc_attr( self::OPT . '[' . $k . ']' ); ?>" value="<?php echo esc_attr( self::opt( $k ) ); ?>">
						<p class="description"><?php echo esc_html( $f[1] ); ?></p></td></tr>
					<?php endforeach; ?>
				</table>
				<?php submit_button(); ?>
			</form>
			<h2>Shortcodes</h2>
			<table class="widefat striped" style="max-width:820px">
				<tr><td><code>[colabpoint_packages]</code></td><td>Live package cards (prices update from the app). Option: <code>button="Book a tour"</code></td></tr>
				<tr><td><code>[colabpoint_enquiry]</code></td><td>Enquiry form — every submission appears in the app under Leads.</td></tr>
				<tr><td><code>[colabpoint_join_button]</code></td><td>Button to the online joining form. Option: <code>text="Join now"</code></td></tr>
				<tr><td><code>[colabpoint_login_button]</code></td><td>Member login button (opens the member portal).</td></tr>
				<tr><td><code>[colabpoint_social]</code></td><td>Social media links from the app.</td></tr>
			</table>
		</div>
		<?php
	}

	/* ---------- data ---------- */

	private static function api_get( $path ) {
		$res = wp_remote_get(
			self::opt( 'supabase_url' ) . '/rest/v1/' . $path,
			array(
				'timeout' => 8,
				'headers' => array( 'apikey' => self::opt( 'supabase_key' ) ),
			)
		);
		if ( is_wp_error( $res ) || wp_remote_retrieve_response_code( $res ) !== 200 ) {
			return null;
		}
		return json_decode( wp_remote_retrieve_body( $res ), true );
	}

	private static function plans() {
		$p = get_transient( 'colabpoint_plans' );
		if ( false === $p ) {
			$p = self::api_get( 'plans?select=id,name,price,billing_period,features,daily_hour_limit&order=sort_order.asc' );
			if ( is_array( $p ) ) {
				set_transient( 'colabpoint_plans', $p, 10 * MINUTE_IN_SECONDS );
			} else {
				$p = array();
			}
		}
		return $p;
	}

	/* ---------- front end ---------- */

	public static function styles() {
		$a = esc_attr( self::opt( 'accent' ) );
		wp_register_style( 'colabpoint-connect', false, array(), '1.0.0' );
		wp_enqueue_style( 'colabpoint-connect' );
		wp_add_inline_style(
			'colabpoint-connect',
			".cp-wrap{--cp:{$a};font-family:inherit}.cp-plans{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:18px}
			.cp-plan{border:1px solid #e8e5dc;border-radius:16px;padding:22px;background:#fff;display:flex;flex-direction:column;gap:10px}
			.cp-plan h3{margin:0;font-size:20px}.cp-price{font-size:30px;font-weight:800}.cp-price small{font-size:14px;font-weight:500;opacity:.6}
			.cp-plan ul{margin:0;padding-left:18px;flex:1}.cp-plan li{margin:4px 0}
			.cp-btn{display:inline-block;background:#1d1c19;color:#fff!important;padding:11px 18px;border-radius:10px;text-decoration:none!important;font-weight:600;text-align:center;border:0;cursor:pointer}
			.cp-btn.alt{background:var(--cp);color:#1d1c19!important}
			.cp-form{display:grid;gap:12px;max-width:560px}.cp-form input,.cp-form select,.cp-form textarea{width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:10px;font:inherit}
			.cp-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}@media(max-width:600px){.cp-row{grid-template-columns:1fr}}
			.cp-ok{background:#e7f5ec;color:#18794e;padding:12px 14px;border-radius:10px}.cp-err{background:#fdecea;color:#b42318;padding:12px 14px;border-radius:10px}
			.cp-social{display:flex;gap:10px;flex-wrap:wrap}.cp-hp{position:absolute!important;left:-9999px!important}"
		);
	}

	public static function sc_packages( $atts ) {
		$atts  = shortcode_atts( array( 'button' => 'Book a free tour' ), $atts );
		$plans = self::plans();
		if ( ! $plans ) {
			return '<div class="cp-wrap"><p>Packages are loading — please call or WhatsApp us for current prices.</p></div>';
		}
		$wa  = self::opt( 'whatsapp' );
		$out = '<div class="cp-wrap"><div class="cp-plans">';
		foreach ( $plans as $p ) {
			$per   = array( 'month' => '/ month', 'day' => '/ day', 'week' => '/ week', 'hour' => '/ hour', 'year' => '/ year' );
			$price = $p['price'] ? 'Rs ' . number_format_i18n( (float) $p['price'] ) . ' <small>' . esc_html( $per[ $p['billing_period'] ] ?? '' ) . '</small>' : 'Custom <small>on request</small>';
			$msg   = rawurlencode( 'Assalam-o-Alaikum, I am interested in the ' . $p['name'] . ' package at CoLab Point.' );
			$out  .= '<div class="cp-plan"><h3>' . esc_html( $p['name'] ) . '</h3><div class="cp-price">' . wp_kses_post( $price ) . '</div><ul>';
			foreach ( (array) ( $p['features'] ?? array() ) as $f ) {
				$out .= '<li>' . esc_html( $f ) . '</li>';
			}
			$out .= '</ul><a class="cp-btn alt" target="_blank" rel="noopener" href="' . esc_url( 'https://wa.me/' . $wa . '?text=' . $msg ) . '">' . esc_html( $atts['button'] ) . '</a></div>';
		}
		return $out . '</div></div>';
	}

	public static function sc_enquiry() {
		$state = isset( $_GET['cp_enquiry'] ) ? sanitize_key( wp_unslash( $_GET['cp_enquiry'] ) ) : '';
		$plans = self::plans();
		ob_start();
		?>
		<div class="cp-wrap">
			<?php if ( 'ok' === $state ) : ?><p class="cp-ok">Thank you! Our team will contact you shortly.</p><?php endif; ?>
			<?php if ( 'err' === $state ) : ?><p class="cp-err">Sorry, something went wrong. Please WhatsApp us instead.</p><?php endif; ?>
			<form class="cp-form" method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<input type="hidden" name="action" value="colabpoint_enquiry">
				<?php wp_nonce_field( 'colabpoint_enquiry', 'cp_nonce' ); ?>
				<input class="cp-hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
				<input name="name" placeholder="Your name *" required>
				<div class="cp-row"><input name="phone" placeholder="Mobile / WhatsApp *" required><input type="email" name="email" placeholder="Email"></div>
				<select name="plan"><option value="">Which package interests you?</option>
					<?php foreach ( $plans as $p ) : ?><option value="<?php echo esc_attr( $p['id'] ); ?>"><?php echo esc_html( $p['name'] ); ?></option><?php endforeach; ?>
				</select>
				<textarea name="message" rows="3" placeholder="Day or night shift? How many seats?"></textarea>
				<button class="cp-btn" type="submit">Send enquiry</button>
			</form>
		</div>
		<?php
		return ob_get_clean();
	}

	public static function handle_enquiry() {
		$back = wp_get_referer() ? wp_get_referer() : home_url( '/' );
		$back = remove_query_arg( 'cp_enquiry', $back );
		if ( ! isset( $_POST['cp_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['cp_nonce'] ) ), 'colabpoint_enquiry' ) || ! empty( $_POST['website'] ) ) {
			wp_safe_redirect( add_query_arg( 'cp_enquiry', 'err', $back ) );
			exit;
		}
		$plan = sanitize_text_field( wp_unslash( $_POST['plan'] ?? '' ) );
		$row  = array(
			'name'               => sanitize_text_field( wp_unslash( $_POST['name'] ?? '' ) ),
			'phone'              => sanitize_text_field( wp_unslash( $_POST['phone'] ?? '' ) ),
			'email'              => sanitize_email( wp_unslash( $_POST['email'] ?? '' ) ),
			'notes'              => sanitize_textarea_field( wp_unslash( $_POST['message'] ?? '' ) ),
			'department'         => 'coworking',
			'source'             => 'website',
			'status'             => 'new',
			'utm_source'         => 'colabpoint.com',
			'interested_plan_id' => preg_match( '/^[0-9a-f-]{36}$/', $plan ) ? $plan : null,
		);
		if ( '' === $row['name'] || '' === $row['phone'] ) {
			wp_safe_redirect( add_query_arg( 'cp_enquiry', 'err', $back ) );
			exit;
		}
		$res = wp_remote_post(
			self::opt( 'supabase_url' ) . '/rest/v1/leads',
			array(
				'timeout' => 8,
				'headers' => array(
					'apikey'       => self::opt( 'supabase_key' ),
					'Content-Type' => 'application/json',
					'Prefer'       => 'return=minimal',
				),
				'body'    => wp_json_encode( $row ),
			)
		);
		$ok = ! is_wp_error( $res ) && wp_remote_retrieve_response_code( $res ) < 300;
		wp_safe_redirect( add_query_arg( 'cp_enquiry', $ok ? 'ok' : 'err', $back ) . '#cp' );
		exit;
	}

	public static function sc_join( $atts ) {
		$atts = shortcode_atts( array( 'text' => 'Fill the joining form' ), $atts );
		return '<a class="cp-btn alt" href="' . esc_url( self::opt( 'app_url' ) . '/#/join' ) . '">' . esc_html( $atts['text'] ) . '</a>';
	}

	public static function sc_login( $atts ) {
		$atts = shortcode_atts( array( 'text' => 'Member login' ), $atts );
		return '<a class="cp-btn" href="' . esc_url( self::opt( 'app_url' ) . '/' ) . '">' . esc_html( $atts['text'] ) . '</a>';
	}

	public static function sc_social() {
		$s = get_transient( 'colabpoint_social' );
		if ( false === $s ) {
			$s = self::api_get( 'social_accounts?select=platform,url,handle' );
			$s = is_array( $s ) ? $s : array();
			set_transient( 'colabpoint_social', $s, HOUR_IN_SECONDS );
		}
		$out = '<div class="cp-wrap cp-social">';
		foreach ( $s as $a ) {
			$out .= '<a class="cp-btn" target="_blank" rel="noopener" href="' . esc_url( $a['url'] ) . '">' . esc_html( ucfirst( $a['platform'] ) ) . '</a>';
		}
		$wa = self::opt( 'whatsapp' );
		if ( $wa ) {
			$out .= '<a class="cp-btn alt" target="_blank" rel="noopener" href="' . esc_url( 'https://wa.me/' . $wa ) . '">WhatsApp</a>';
		}
		return $out . '</div>';
	}
}

CoLab_Point_Connect::init();
