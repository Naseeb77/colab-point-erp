<?php
/**
 * Plugin Name:       CoLab Point Connect
 * Description:       Connects colabpoint.com to the CoLab Point workspace app: live packages, enquiry form (goes to Leads), joining form, member login, social links — plus local-SEO / AI-search structured data (LocalBusiness, offers, FAQ) and an /llms.txt summary.
 * Version:           1.1.0
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
		add_shortcode( 'colabpoint_faq', array( __CLASS__, 'sc_faq' ) );
		add_action( 'wp_head', array( __CLASS__, 'json_ld' ), 5 );
		add_action( 'init', array( __CLASS__, 'llms_rewrite' ) );
		add_filter( 'query_vars', function ( $v ) { $v[] = 'colabpoint_llms'; return $v; } );
		add_action( 'template_redirect', array( __CLASS__, 'llms_txt' ) );
		register_activation_hook( __FILE__, function () { self::llms_rewrite(); flush_rewrite_rules(); } );
	}

	/* ---------- settings ---------- */

	public static function defaults() {
		return array(
			'supabase_url' => 'https://fwbzugaebdecuypoajvg.supabase.co',
			'supabase_key' => 'sb_publishable_5e1_j0xTgHwvo3UH1eWJ2w_Ten5MJCd',
			'app_url'      => 'https://app.colabpoint.com',
			'whatsapp'     => '923497684322',
			'accent'       => '#1f8ac0',
			'schema'       => '1',
			'faqs'         => "Where is CoLab Point?|2nd Floor, Anwar Center, Madina Road, near Gymkhana, Gujrat.\nDo you have night shifts?|Yes. We have day and night shifts, so you can work in your preferred hours.\nHow much does a seat cost?|Shared Space starts at Rs 12,000 per month and a Dedicated Desk is Rs 16,000 per month. Private offices are priced on request.\nIs there high-speed internet?|Yes, every plan includes high-speed internet.\nCan I visit before joining?|Yes — message us on WhatsApp to book a free tour.",
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
					$out['accent']       = sanitize_hex_color( $in['accent'] ?? '' ) ?: '#1f8ac0';
					$out['schema']       = empty( $in['schema'] ) ? '0' : '1';
					$out['faqs']         = sanitize_textarea_field( $in['faqs'] ?? '' );
					delete_transient( 'colabpoint_org' );
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
						'accent'       => array( 'Button colour', 'Hex colour, e.g. #1f8ac0' ),
						'supabase_url' => array( 'Database URL', 'Public project URL (already filled in).' ),
						'supabase_key' => array( 'Publishable key', 'Public key (already filled in). Never paste a secret/service key here.' ),
					);
					foreach ( $fields as $k => $f ) :
						?>
						<tr><th scope="row"><label for="cp-<?php echo esc_attr( $k ); ?>"><?php echo esc_html( $f[0] ); ?></label></th>
						<td><input class="regular-text" id="cp-<?php echo esc_attr( $k ); ?>" name="<?php echo esc_attr( self::OPT . '[' . $k . ']' ); ?>" value="<?php echo esc_attr( self::opt( $k ) ); ?>">
						<p class="description"><?php echo esc_html( $f[1] ); ?></p></td></tr>
					<?php endforeach; ?>
					<tr><th scope="row">Search & AI structured data</th><td><label><input type="checkbox" name="<?php echo esc_attr( self::OPT ); ?>[schema]" value="1" <?php checked( self::opt( 'schema' ), '1' ); ?>> Add LocalBusiness + packages + FAQ data to every page (turn off if your SEO plugin already outputs LocalBusiness)</label></td></tr>
					<tr><th scope="row"><label for="cp-faqs">FAQs</label></th><td><textarea id="cp-faqs" class="large-text" rows="7" name="<?php echo esc_attr( self::OPT ); ?>[faqs]"><?php echo esc_textarea( self::opt( 'faqs' ) ); ?></textarea><p class="description">One per line: <code>Question|Answer</code>. Shown by <code>[colabpoint_faq]</code> and added as FAQ data for Google and AI answers.</p></td></tr>
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
				<tr><td><code>[colabpoint_faq]</code></td><td>Frequently asked questions (with FAQ structured data).</td></tr>
				<tr><td><code><?php echo esc_html( home_url( '/llms.txt' ) ); ?></code></td><td>Plain-text summary of the business and live packages for AI tools.</td></tr>
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

	private static function org() {
		$o = get_transient( 'colabpoint_org' );
		if ( false === $o ) {
			$r = self::api_get( 'org_settings?select=name,address,phone,email,website,description,opening_hours,latitude,longitude,google_maps_url' );
			$o = is_array( $r ) && $r ? $r[0] : array();
			set_transient( 'colabpoint_org', $o, HOUR_IN_SECONDS );
		}
		return $o;
	}

	private static function socials() {
		$s = get_transient( 'colabpoint_social' );
		if ( false === $s ) {
			$s = self::api_get( 'social_accounts?select=platform,url,handle' );
			$s = is_array( $s ) ? $s : array();
			set_transient( 'colabpoint_social', $s, HOUR_IN_SECONDS );
		}
		return $s;
	}

	private static function faqs() {
		$out = array();
		foreach ( preg_split( '/\r?\n/', (string) self::opt( 'faqs' ) ) as $line ) {
			$p = array_map( 'trim', explode( '|', $line, 2 ) );
			if ( count( $p ) === 2 && $p[0] && $p[1] ) {
				$out[] = $p;
			}
		}
		return $out;
	}

	/* ---------- SEO / AI search ---------- */

	public static function json_ld() {
		if ( '1' !== self::opt( 'schema' ) || is_admin() ) {
			return;
		}
		$o     = self::org();
		$plans = self::plans();
		$biz   = array(
			'@context'    => 'https://schema.org',
			'@type'       => 'LocalBusiness',
			'@id'         => home_url( '/#business' ),
			'name'        => $o['name'] ?? 'CoLab Point',
			'description' => $o['description'] ?? '',
			'url'         => home_url( '/' ),
			'telephone'   => $o['phone'] ?? '',
			'email'       => $o['email'] ?? '',
			'image'       => get_site_icon_url( 512 ),
			'logo'        => get_site_icon_url( 512 ),
			'priceRange'  => 'Rs 12,000 – Rs 16,000 / month',
			'address'     => array(
				'@type'           => 'PostalAddress',
				'streetAddress'   => $o['address'] ?? '',
				'addressLocality' => 'Gujrat',
				'addressRegion'   => 'Punjab',
				'addressCountry'  => 'PK',
			),
			'sameAs'      => array_values( array_map( function ( $a ) { return $a['url']; }, self::socials() ) ),
			'amenityFeature' => array_map( function ( $n ) { return array( '@type' => 'LocationFeatureSpecification', 'name' => $n, 'value' => true ); }, array( 'High-speed internet', 'Day and night shifts', 'Meeting room', 'Parking', 'Printing and scanning', 'Tea and coffee' ) ),
		);
		if ( ! empty( $o['opening_hours'] ) ) {
			$biz['openingHours'] = $o['opening_hours'];
		}
		if ( ! empty( $o['latitude'] ) && ! empty( $o['longitude'] ) ) {
			$biz['geo'] = array( '@type' => 'GeoCoordinates', 'latitude' => (float) $o['latitude'], 'longitude' => (float) $o['longitude'] );
		}
		if ( ! empty( $o['google_maps_url'] ) ) {
			$biz['hasMap'] = $o['google_maps_url'];
		}
		if ( $plans ) {
			$biz['makesOffer'] = array();
			foreach ( $plans as $p ) {
				$offer = array( '@type' => 'Offer', 'name' => $p['name'], 'itemOffered' => array( '@type' => 'Service', 'name' => $p['name'] . ' — coworking membership' ) );
				if ( $p['price'] ) {
					$offer['price']         = (string) $p['price'];
					$offer['priceCurrency'] = 'PKR';
					$offer['priceSpecification'] = array( '@type' => 'UnitPriceSpecification', 'price' => (string) $p['price'], 'priceCurrency' => 'PKR', 'unitText' => $p['billing_period'] );
				}
				$biz['makesOffer'][] = $offer;
			}
		}
		echo "\n<script type=\"application/ld+json\">" . wp_json_encode( array_filter( $biz ), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "</script>\n";
	}

	public static function sc_faq() {
		$faqs = self::faqs();
		if ( ! $faqs ) {
			return '';
		}
		$html   = '<div class="cp-wrap cp-faq">';
		$schema = array( '@context' => 'https://schema.org', '@type' => 'FAQPage', 'mainEntity' => array() );
		foreach ( $faqs as $f ) {
			$html .= '<details><summary><strong>' . esc_html( $f[0] ) . '</strong></summary><p>' . esc_html( $f[1] ) . '</p></details>';
			$schema['mainEntity'][] = array( '@type' => 'Question', 'name' => $f[0], 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => $f[1] ) );
		}
		return $html . '</div><script type="application/ld+json">' . wp_json_encode( $schema, JSON_UNESCAPED_UNICODE ) . '</script>';
	}

	public static function llms_rewrite() {
		add_rewrite_rule( '^llms\.txt$', 'index.php?colabpoint_llms=1', 'top' );
	}

	public static function llms_txt() {
		if ( ! get_query_var( 'colabpoint_llms' ) ) {
			return;
		}
		$o  = self::org();
		$tx = '# ' . ( $o['name'] ?? 'CoLab Point' ) . "\n\n> " . ( $o['description'] ?? '' ) . "\n\n";
		$tx .= "## Contact\n- Address: " . ( $o['address'] ?? '' ) . "\n- Phone / WhatsApp: " . ( $o['phone'] ?? '' ) . "\n- Email: " . ( $o['email'] ?? '' ) . "\n- Website: " . home_url( '/' ) . "\n";
		if ( ! empty( $o['opening_hours'] ) ) {
			$tx .= '- Opening hours: ' . $o['opening_hours'] . "\n";
		}
		$tx .= "\n## Packages (live prices)\n";
		foreach ( self::plans() as $p ) {
			$tx .= '- ' . $p['name'] . ': ' . ( $p['price'] ? 'Rs ' . number_format( (float) $p['price'] ) . ' per ' . $p['billing_period'] : 'price on request' );
			if ( ! empty( $p['features'] ) ) {
				$tx .= ' — ' . implode( ', ', (array) $p['features'] );
			}
			$tx .= "\n";
		}
		if ( $faqs = self::faqs() ) {
			$tx .= "\n## FAQ\n";
			foreach ( $faqs as $f ) {
				$tx .= '- Q: ' . $f[0] . "\n  A: " . $f[1] . "\n";
			}
		}
		$tx .= "\n## Links\n- Join online: " . self::opt( 'app_url' ) . "/#/join\n";
		foreach ( self::socials() as $s ) {
			$tx .= '- ' . ucfirst( $s['platform'] ) . ': ' . $s['url'] . "\n";
		}
		header( 'Content-Type: text/plain; charset=utf-8' );
		echo $tx; // phpcs:ignore WordPress.Security.EscapeOutput -- plain text
		exit;
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
			.cp-social{display:flex;gap:10px;flex-wrap:wrap}.cp-faq details{border:1px solid #e2e8ee;border-radius:12px;padding:12px 16px;margin:8px 0}.cp-faq summary{cursor:pointer}.cp-hp{position:absolute!important;left:-9999px!important}"
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
		$s   = self::socials();
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
