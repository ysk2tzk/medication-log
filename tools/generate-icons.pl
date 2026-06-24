my $icon_dir = "/home/ysk2tzk/medication-log/icons";

sub crc32 {
  my ($data) = @_;
  my $crc = 0xFFFFFFFF;

  foreach my $byte (unpack("C*", $data)) {
    $crc ^= $byte;
    for (1 .. 8) {
      my $mask = -($crc & 1);
      $crc = ($crc >> 1) ^ (0xEDB88320 & $mask);
    }
  }

  return $crc ^ 0xFFFFFFFF;
}

sub adler32 {
  my ($data) = @_;
  my $a = 1;
  my $b = 0;

  foreach my $byte (unpack("C*", $data)) {
    $a = ($a + $byte) % 65521;
    $b = ($b + $a) % 65521;
  }

  return ($b << 16) | $a;
}

sub png_chunk {
  my ($type, $data) = @_;
  return pack("N", length($data))
    . $type
    . $data
    . pack("N", crc32($type . $data));
}

sub zlib_store {
  my ($raw) = @_;
  my $output = pack("C*", 0x78, 0x01);
  my $remaining = $raw;

  while (length($remaining) > 0) {
    my $block = substr($remaining, 0, 65535, "");
    my $is_final = length($remaining) == 0 ? 1 : 0;
    my $length = length($block);
    $output .= pack("C", $is_final);
    $output .= pack("v", $length);
    $output .= pack("v", 0xFFFF - $length);
    $output .= $block;
  }

  $output .= pack("N", adler32($raw));
  return $output;
}

sub inside_rounded_rect {
  my ($x, $y, $left, $top, $width, $height, $radius) = @_;
  my $right = $left + $width;
  my $bottom = $top + $height;
  my $clamped_x = $x < ($left + $radius) ? ($left + $radius) : $x > ($right - $radius) ? ($right - $radius) : $x;
  my $clamped_y = $y < ($top + $radius) ? ($top + $radius) : $y > ($bottom - $radius) ? ($bottom - $radius) : $y;
  my $dx = $x - $clamped_x;
  my $dy = $y - $clamped_y;
  return ($dx * $dx) + ($dy * $dy) <= ($radius * $radius);
}

sub inside_polygon {
  my ($x, $y, $points_ref) = @_;
  my @points = @$points_ref;
  my $inside = 0;
  my $j = $#points;

  for my $i (0 .. $#points) {
    my ($xi, $yi) = @{$points[$i]};
    my ($xj, $yj) = @{$points[$j]};
    if ((($yi > $y) != ($yj > $y)) && ($x < ($xj - $xi) * ($y - $yi) / (($yj - $yi) || 1e-6) + $xi)) {
      $inside = !$inside;
    }
    $j = $i;
  }

  return $inside;
}

sub distance_to_segment {
  my ($px, $py, $ax, $ay, $bx, $by) = @_;
  my $abx = $bx - $ax;
  my $aby = $by - $ay;
  my $apx = $px - $ax;
  my $apy = $py - $ay;
  my $ab_len_sq = ($abx * $abx) + ($aby * $aby);
  my $t = $ab_len_sq == 0 ? 0 : (($apx * $abx) + ($apy * $aby)) / $ab_len_sq;
  $t = 0 if $t < 0;
  $t = 1 if $t > 1;
  my $cx = $ax + ($abx * $t);
  my $cy = $ay + ($aby * $t);
  my $dx = $px - $cx;
  my $dy = $py - $cy;
  return sqrt(($dx * $dx) + ($dy * $dy));
}

sub icon_png {
  my ($size) = @_;
  my %palette = (
    bg => [237, 247, 247, 255],
    red => [242, 95, 76, 255],
    cream => [255, 253, 248, 255],
    navy => [24, 52, 90, 255],
  );

  my $capsule_left = $size * 0.125;
  my $capsule_right = $size * 0.875;
  my $capsule_top = $size * 0.328;
  my $capsule_bottom = $size * 0.672;
  my $capsule_radius = ($capsule_bottom - $capsule_top) / 2;
  my $capsule_mid = $size * 0.500;
  my $outline_thickness = $size * 0.010;
  my $capsule_outline = $size * 0.006;
  my $cx = $size * 0.5;
  my $cy = $size * 0.5;
  my $angle = 0.78539816339;

  my $raw = "";
  for my $y (0 .. $size - 1) {
    $raw .= pack("C", 0);
    for my $x (0 .. $size - 1) {
      my $color = $palette{bg};
      my $dx = $x - $cx;
      my $dy = $y - $cy;
      my $rx = ($dx * cos($angle)) - ($dy * sin($angle)) + $cx;
      my $ry = ($dx * sin($angle)) + ($dy * cos($angle)) + $cy;

      if (inside_rounded_rect(
        $rx, $ry, $capsule_left, $capsule_top, $capsule_right - $capsule_left, $capsule_bottom - $capsule_top, $capsule_radius
      )) {
        $color = $rx < $capsule_mid ? $palette{red} : $palette{cream};
      }

      if (
        inside_rounded_rect(
          $rx, $ry, $capsule_left, $capsule_top, $capsule_right - $capsule_left, $capsule_bottom - $capsule_top, $capsule_radius
        )
        && !inside_rounded_rect(
          $rx, $ry,
          $capsule_left + $capsule_outline,
          $capsule_top + $capsule_outline,
          ($capsule_right - $capsule_left) - ($capsule_outline * 2),
          ($capsule_bottom - $capsule_top) - ($capsule_outline * 2),
          $capsule_radius - $capsule_outline
        )
      ) {
        $color = $palette{navy};
      }

      if (abs($rx - $capsule_mid) <= $outline_thickness && $ry >= $capsule_top && $ry <= $capsule_bottom) {
        $color = $palette{navy};
      }

      $raw .= pack("C4", @$color);
    }
  }

  my $signature = pack("C*", 137, 80, 78, 71, 13, 10, 26, 10);
  my $ihdr = pack("NNC5", $size, $size, 8, 6, 0, 0, 0);
  return $signature
    . png_chunk("IHDR", $ihdr)
    . png_chunk("IDAT", zlib_store($raw))
    . png_chunk("IEND", "");
}

mkdir $icon_dir unless -d $icon_dir;

my %files = (
  "apple-touch-icon.png" => 180,
  "icon-192.png" => 192,
  "icon-512.png" => 512,
);

while (my ($name, $size) = each %files) {
  open my $fh, ">", "$icon_dir/$name" or die "Failed to write $name: $!";
  binmode $fh;
  print {$fh} icon_png($size);
  close $fh;
}
