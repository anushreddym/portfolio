function getMarkdownCodeForImages(imagePaths, html) {
  return `
			import { getImage } from "astro:assets";
			${imagePaths.map((entry) => `import Astro__${entry.safeName} from ${JSON.stringify(entry.raw)};`).join("\n")}

			const images = async function(html) {
					const imageSources = {};
					${imagePaths.map((entry) => {
    const rawUrl = JSON.stringify(entry.raw);
    return `{
											const regex = new RegExp('__ASTRO_IMAGE_="([^"]*' + ${rawUrl.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\\\$&"
    )} + '[^"]*)"', 'g');
											let match;
											let occurrenceCounter = 0;
											while ((match = regex.exec(html)) !== null) {
													const matchKey = ${rawUrl} + '_' + occurrenceCounter;
													const imageProps = JSON.parse(match[1].replace(/&#x22;/g, '"'));
													const { src, ...props } = imageProps;
													
													imageSources[matchKey] = await getImage({src: Astro__${entry.safeName}, ...props});
													occurrenceCounter++;
											}
									}`;
  }).join("\n")}
					return imageSources;
			};

			async function updateImageReferences(html) {
				return images(html).then((imageSources) => {
						return html.replaceAll(/__ASTRO_IMAGE_="([^"]+)"/gm, (full, imagePath) => {
								const decodedImagePath = JSON.parse(imagePath.replace(/&#x22;/g, '"'));
		
								// Use the 'index' property for each image occurrence
								const srcKey = decodedImagePath.src + '_' + decodedImagePath.index;
		
								if (imageSources[srcKey].srcSet && imageSources[srcKey].srcSet.values.length > 0) {
										imageSources[srcKey].attributes.srcset = imageSources[srcKey].srcSet.attribute;
								}
		
								const { index, ...attributesWithoutIndex } = imageSources[srcKey].attributes;
		
								return spreadAttributes({
										src: imageSources[srcKey].src,
										...attributesWithoutIndex,
								});
						});
				});
		}
		

		// NOTE: This causes a top-level await to appear in the user's code, which can break very easily due to a Rollup
	  // bug and certain adapters not supporting it correctly. See: https://github.com/rollup/rollup/issues/4708
	  // Tread carefully!
			const html = await updateImageReferences(${JSON.stringify(html)});
	`;
}
export {
  getMarkdownCodeForImages
};
