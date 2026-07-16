// blur-behind.shader — for obs-shaderfilter
// Blurs only inside a rounded rectangle (the "card" behind the widget).
// rect_* values are in scene pixels and are driven automatically by blur-follow.lua.

uniform float rect_left<
    string label = "Rect left (px)";
    string widget_type = "slider";
    float minimum = 0.0; float maximum = 3840.0; float step = 1.0;
> = 0.0;
uniform float rect_top<
    string label = "Rect top (px)";
    string widget_type = "slider";
    float minimum = 0.0; float maximum = 2160.0; float step = 1.0;
> = 0.0;
uniform float rect_right<
    string label = "Rect right (px)";
    string widget_type = "slider";
    float minimum = 0.0; float maximum = 3840.0; float step = 1.0;
> = 0.0;
uniform float rect_bottom<
    string label = "Rect bottom (px)";
    string widget_type = "slider";
    float minimum = 0.0; float maximum = 2160.0; float step = 1.0;
> = 0.0;
uniform float corner_radius<
    string label = "Corner radius (px)";
    string widget_type = "slider";
    float minimum = 0.0; float maximum = 200.0; float step = 1.0;
> = 24.0;
uniform float blur_size<
    string label = "Blur strength";
    string widget_type = "slider";
    float minimum = 0.0; float maximum = 40.0; float step = 0.5;
> = 10.0;
uniform float feather<
    string label = "Edge feather (px)";
    string widget_type = "slider";
    float minimum = 0.0; float maximum = 100.0; float step = 1.0;
> = 8.0;

float4 mainImage(VertData v_in) : TARGET
{
    float4 orig = image.Sample(textureSampler, v_in.uv);

    // No rect set yet -> pass through
    if (rect_right <= rect_left || rect_bottom <= rect_top) {
        return orig;
    }

    float2 px = v_in.uv * uv_size;

    // Rounded-rectangle signed distance (negative = inside)
    float2 rmin = float2(rect_left, rect_top);
    float2 rmax = float2(rect_right, rect_bottom);
    float2 center = (rmin + rmax) * 0.5;
    float2 halfsize = max((rmax - rmin) * 0.5 - corner_radius, 0.0);
    float2 q = abs(px - center) - halfsize;
    float dist = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - corner_radius;

    // 1 inside the card, 0 outside, soft edge over 'feather' px
    float blend = 1.0 - smoothstep(-feather, 0.0, dist);
    if (blend <= 0.001 || blur_size <= 0.0) {
        return orig;
    }

    // 7x7 weighted blur
    float2 texel = (blur_size / 3.0) / uv_size;
    float4 sum = float4(0.0, 0.0, 0.0, 0.0);
    float wsum = 0.0;
    for (int x = -3; x <= 3; x++) {
        for (int y = -3; y <= 3; y++) {
            float w = 1.0 / (1.0 + float(x * x + y * y));
            sum += image.Sample(textureSampler, v_in.uv + float2(float(x), float(y)) * texel) * w;
            wsum += w;
        }
    }
    float4 blurred = sum / wsum;

    return lerp(orig, blurred, blend);
}
