-- blur-follow.lua
-- Makes a Composite Blur crop mask follow a source (e.g. the Raika widget browser source).
-- Requires: obs-composite-blur plugin installed, a "Composite Blur" filter on the
-- background source with Effect Mask type set to "Crop" (set once, manually).
--
-- Setup: OBS > Tools > Scripts > + > pick this file, then fill in the source names.

local obs = obslua
local bit = require("bit")

-- Script settings
local widget_name = ""
local bg_name = ""
local filter_name = "Composite Blur"
local padding = 0
local corner_radius = 20

-- Last applied values (skip redundant updates)
local last = { l = -1, r = -1, t = -1, b = -1 }

function script_description()
  return [[Auto-moves a blur region to follow another source.
Drag the widget in the preview and the blur card follows (~200ms).

Works with either:
- obs-composite-blur: add a Composite Blur filter, set Effect Mask type to "Crop"
- obs-shaderfilter: add a User-defined shader filter loading blur-behind.shader

Point "Blur filter name" at whichever filter you added.]]
end

function script_properties()
  local p = obs.obs_properties_create()
  obs.obs_properties_add_text(p, "widget_name", "Widget source name (exact)", obs.OBS_TEXT_DEFAULT)
  obs.obs_properties_add_text(p, "bg_name", "Background source name (exact)", obs.OBS_TEXT_DEFAULT)
  obs.obs_properties_add_text(p, "filter_name", "Blur filter name", obs.OBS_TEXT_DEFAULT)
  obs.obs_properties_add_int(p, "padding", "Padding around widget (px)", -200, 500, 1)
  obs.obs_properties_add_int(p, "corner_radius", "Corner radius (px)", 0, 200, 1)
  obs.obs_properties_add_button(p, "dump", "Log filter settings (debug)", dump_settings)
  return p
end

function script_defaults(settings)
  obs.obs_data_set_default_string(settings, "filter_name", "Composite Blur")
  obs.obs_data_set_default_int(settings, "padding", 0)
  obs.obs_data_set_default_int(settings, "corner_radius", 20)
end

function script_update(settings)
  widget_name = obs.obs_data_get_string(settings, "widget_name")
  bg_name = obs.obs_data_get_string(settings, "bg_name")
  filter_name = obs.obs_data_get_string(settings, "filter_name")
  padding = obs.obs_data_get_int(settings, "padding")
  corner_radius = obs.obs_data_get_int(settings, "corner_radius")
  -- Force re-apply after settings change
  last = { l = -1, r = -1, t = -1, b = -1 }
end

function script_load(_)
  obs.timer_add(tick, 200)
end

function script_unload()
  obs.timer_remove(tick)
end

-- Debug helper: prints the blur filter's current settings JSON to the script log,
-- so the exact mask property names for your plugin version can be checked.
function dump_settings()
  local bg = obs.obs_get_source_by_name(bg_name)
  if bg == nil then
    obs.script_log(obs.LOG_WARNING, "Background source not found: " .. bg_name)
    return false
  end
  local f = obs.obs_source_get_filter_by_name(bg, filter_name)
  if f ~= nil then
    local s = obs.obs_source_get_settings(f)
    obs.script_log(obs.LOG_INFO, "Filter settings: " .. obs.obs_data_get_json(s))
    obs.obs_data_release(s)
    obs.obs_source_release(f)
  else
    obs.script_log(obs.LOG_WARNING, "Filter not found: " .. filter_name)
  end
  obs.obs_source_release(bg)
  return false
end

-- Compute the widget's bounding box in scene pixels: {x, y, w, h} or nil.
local function get_widget_rect()
  local scene_src = obs.obs_frontend_get_current_scene()
  if scene_src == nil then return nil end
  local scene = obs.obs_scene_from_source(scene_src)
  local rect = nil

  local items = obs.obs_scene_enum_items(scene)
  if items ~= nil then
    for _, item in ipairs(items) do
      local src = obs.obs_sceneitem_get_source(item)
      if src ~= nil and obs.obs_source_get_name(src) == widget_name then
        local pos = obs.vec2()
        obs.obs_sceneitem_get_pos(item, pos)

        -- Size: bounds if set, otherwise (source size - crop) * scale
        local w, h
        local btype = obs.obs_sceneitem_get_bounds_type(item)
        if btype ~= obs.OBS_BOUNDS_NONE then
          local bounds = obs.vec2()
          obs.obs_sceneitem_get_bounds(item, bounds)
          w, h = bounds.x, bounds.y
        else
          local scale = obs.vec2()
          obs.obs_sceneitem_get_scale(item, scale)
          local crop = obs.obs_sceneitem_crop()
          obs.obs_sceneitem_get_crop(item, crop)
          w = (obs.obs_source_get_width(src) - crop.left - crop.right) * scale.x
          h = (obs.obs_source_get_height(src) - crop.top - crop.bottom) * scale.y
        end

        -- Alignment: pos is the anchor point, shift to get top-left
        local align = obs.obs_sceneitem_get_alignment(item)
        local x, y = pos.x, pos.y
        if bit.band(align, 2) ~= 0 then      -- OBS_ALIGN_RIGHT
          x = pos.x - w
        elseif bit.band(align, 1) == 0 then  -- horizontal center
          x = pos.x - w / 2
        end
        if bit.band(align, 8) ~= 0 then      -- OBS_ALIGN_BOTTOM
          y = pos.y - h
        elseif bit.band(align, 4) == 0 then  -- vertical center
          y = pos.y - h / 2
        end

        rect = { x = x, y = y, w = w, h = h }
        break
      end
    end
    obs.sceneitem_list_release(items)
  end

  obs.obs_source_release(scene_src)
  return rect
end

function tick()
  if widget_name == "" or bg_name == "" then return end

  local rect = get_widget_rect()
  if rect == nil then return end

  -- Canvas size
  local ovi = obs.obs_video_info()
  obs.obs_get_video_info(ovi)
  local cw, ch = ovi.base_width, ovi.base_height
  if cw == 0 or ch == 0 then return end

  -- Crop mask values are percentages measured inward from each edge
  local l = (rect.x - padding) / cw * 100
  local r = (cw - (rect.x + rect.w + padding)) / cw * 100
  local t = (rect.y - padding) / ch * 100
  local b = (ch - (rect.y + rect.h + padding)) / ch * 100

  -- Clamp 0..100
  l = math.max(0, math.min(100, l))
  r = math.max(0, math.min(100, r))
  t = math.max(0, math.min(100, t))
  b = math.max(0, math.min(100, b))

  -- Skip if unchanged (within 0.05%)
  if math.abs(l - last.l) < 0.05 and math.abs(r - last.r) < 0.05
     and math.abs(t - last.t) < 0.05 and math.abs(b - last.b) < 0.05 then
    return
  end

  local bg = obs.obs_get_source_by_name(bg_name)
  if bg == nil then return end
  local f = obs.obs_source_get_filter_by_name(bg, filter_name)
  if f ~= nil then
    local s = obs.obs_data_create()
    -- Composite Blur crop mask keys (percent from each edge)
    obs.obs_data_set_double(s, "effect_mask_crop_left", l)
    obs.obs_data_set_double(s, "effect_mask_crop_right", r)
    obs.obs_data_set_double(s, "effect_mask_crop_top", t)
    obs.obs_data_set_double(s, "effect_mask_crop_bot", b)
    obs.obs_data_set_double(s, "effect_mask_crop_corner_radius", corner_radius)
    -- obs-shaderfilter blur-behind.shader keys (scene pixels); unknown keys are
    -- ignored by whichever plugin is in use, so both sets can be sent together
    obs.obs_data_set_double(s, "rect_left", math.max(0, rect.x - padding))
    obs.obs_data_set_double(s, "rect_top", math.max(0, rect.y - padding))
    obs.obs_data_set_double(s, "rect_right", math.min(cw, rect.x + rect.w + padding))
    obs.obs_data_set_double(s, "rect_bottom", math.min(ch, rect.y + rect.h + padding))
    obs.obs_data_set_double(s, "corner_radius", corner_radius)
    obs.obs_source_update(f, s)
    obs.obs_data_release(s)
    obs.obs_source_release(f)
    last = { l = l, r = r, t = t, b = b }
  end
  obs.obs_source_release(bg)
end
