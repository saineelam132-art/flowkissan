# Flower photos

Put one photo per flower here, named exactly:

`jasmine.jpg`, `marigold.jpg`, `rose.jpg`, `tuberose.jpg`, `chamanthi.jpg`, `crossandra.jpg`, `anthurium.jpg`, `orchid.jpg`

Then run `python tools/export_site.py` and `python tools/build_static.py`. The photo appears in the flower tables on the
Home page and the Flowers page. A flower with no file here simply shows no picture.

Use your own photos or freely licensed ones. For each photo that is not your own, add a line to `credits.json` in this
folder: `{"jasmine": {"credit": "Photo: NAME, CC BY-SA 4.0", "source": "https://..."}}` – the credit is shown under the table.
